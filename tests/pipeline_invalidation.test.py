import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'v2' / 'scripts'))
from binance_demo_live_pipeline import invalidate_stale_candidates


class CandidateInvalidationTests(unittest.TestCase):
    def fresh(self, candidate):
        candidate.setdefault('created_at_ms', 1000)
        return candidate

    def test_unrelated_waiting_structure_does_not_invalidate_plan(self):
        candidates = [
            self.fresh({'symbol': 'BTCUSDT', 'client_order_id': 'old', 'structure_event_id': 'btc-old', 'structure_index': 10, 'side': 'SELL'}),
        ]
        events = {'BTCUSDT': [
            {'event_id': 'btc-old', 'structure_index': 10, 'side': 'SHORT', 'kind': 'FVG', 'confirmation': 'CONFIRMED'},
            {'event_id': 'btc-new', 'structure_index': 11, 'side': 'LONG', 'kind': 'FVG', 'confirmation': 'WAITING', 'lifecycle_state': 'ACTIVE'},
        ]}
        result = invalidate_stale_candidates(candidates, {'BTCUSDT': 'btc-new'}, events, now_ms=1000)
        self.assertEqual([x['client_order_id'] for x in result], ['old'])

    def test_confirmed_opposite_structure_invalidates_plan(self):
        candidate = self.fresh({'symbol': 'BTCUSDT', 'client_order_id': 'old', 'structure_event_id': 'btc-old', 'structure_index': 10, 'side': 'SELL'})
        events = {'BTCUSDT': [
            {'event_id': 'btc-old', 'structure_index': 10, 'side': 'SHORT', 'kind': 'FVG', 'confirmation': 'CONFIRMED'},
            {'event_id': 'btc-break', 'structure_index': 11, 'side': 'LONG', 'kind': 'CHoCH_MSS', 'confirmation': 'CONFIRMED'},
        ]}
        result = invalidate_stale_candidates([candidate], {'BTCUSDT': 'btc-break'}, events, now_ms=1000)
        self.assertEqual(result, [])
        self.assertEqual(candidate['status'], 'INVALIDATED_OPPOSITE_STRUCTURE')

    def test_protected_level_break_invalidates_plan(self):
        candidate = self.fresh({'symbol': 'BTCUSDT', 'client_order_id': 'old', 'structure_event_id': 'btc-old', 'structure_index': 10, 'side': 'BUY', 'protected_level': 100.0, 'current_close': 99.9})
        result = invalidate_stale_candidates([candidate], {'BTCUSDT': 'btc-new'}, {'BTCUSDT': []}, now_ms=1000)
        self.assertEqual(result, [])
        self.assertEqual(candidate['status'], 'INVALIDATED_PROTECTED_LEVEL')

    def test_unbroken_protected_level_preserves_plan(self):
        candidate = self.fresh({'symbol': 'BTCUSDT', 'client_order_id': 'old', 'structure_event_id': 'btc-old', 'structure_index': 10, 'side': 'SELL', 'protected_level': 100.0, 'current_close': 99.9})
        result = invalidate_stale_candidates([candidate], {'BTCUSDT': 'btc-new'}, {'BTCUSDT': []}, now_ms=1000)
        self.assertEqual([x['client_order_id'] for x in result], ['old'])

    def test_mitigated_fvg_invalidates_plan(self):
        candidate = self.fresh({'symbol': 'BTCUSDT', 'client_order_id': 'old', 'structure_event_id': 'btc-old', 'structure_index': 10, 'side': 'SELL', 'poi_type': 'FVG', 'poi_state': 'MITIGATED'})
        result = invalidate_stale_candidates([candidate], {'BTCUSDT': 'btc-new'}, {'BTCUSDT': []}, now_ms=1000)
        self.assertEqual(result, [])
        self.assertEqual(candidate['status'], 'INVALIDATED_POI_MITIGATED')

    def test_touched_fvg_preserves_plan(self):
        candidate = self.fresh({'symbol': 'BTCUSDT', 'client_order_id': 'old', 'structure_event_id': 'btc-old', 'structure_index': 10, 'side': 'SELL', 'poi_type': 'FVG', 'poi_state': 'TOUCHED'})
        result = invalidate_stale_candidates([candidate], {'BTCUSDT': 'btc-new'}, {'BTCUSDT': []}, now_ms=1000)
        self.assertEqual([x['client_order_id'] for x in result], ['old'])

    def test_candidate_structure_event_must_be_confirmed_before_execution(self):
        candidate = self.fresh({'symbol': 'BTCUSDT', 'client_order_id': 'current', 'structure_event_id': 'btc-current', 'structure_index': 12, 'side': 'SELL'})
        self.assertEqual(invalidate_stale_candidates([candidate], {'BTCUSDT': 'btc-current'}, {'BTCUSDT': [{'structure_index': 12, 'confirmation': 'WAITING', 'lifecycle_state': 'ACTIVE'}]}, now_ms=2000), [])
        self.assertEqual(candidate['status'], 'INVALIDATED_UNCONFIRMED_STRUCTURE')

    def test_confirmed_newer_structure_replaces_old_plan(self):
        candidate = self.fresh({'symbol': 'BTCUSDT', 'client_order_id': 'old', 'structure_event_id': 'btc-old', 'structure_index': 10, 'side': 'SELL'})
        self.assertEqual(invalidate_stale_candidates([candidate], {'BTCUSDT': 'btc-current'}, {'BTCUSDT': [{'structure_index': 12, 'confirmation': 'CONFIRMED', 'lifecycle_state': 'ACTIVE'}]}, now_ms=2000), [])
        self.assertEqual(candidate['status'], 'INVALIDATED_STRUCTURE_REPLACED')
        candidate = self.fresh({'symbol': 'BTCUSDT', 'client_order_id': 'old', 'structure_event_id': 'btc-old', 'structure_index': 10, 'side': 'SELL'})
        events = {'BTCUSDT': [
            {'event_id': 'btc-old', 'structure_index': 10, 'side': 'SHORT', 'kind': 'FVG', 'confirmation': 'CONFIRMED', 'lifecycle_state': 'PARTIAL_MITIGATION'},
            {'event_id': 'btc-new', 'structure_index': 11, 'side': 'SHORT', 'kind': 'FVG', 'confirmation': 'CONFIRMED', 'lifecycle_state': 'PARTIAL_MITIGATION'},
        ]}
        result = invalidate_stale_candidates([candidate], {'BTCUSDT': 'btc-new'}, events, now_ms=1000)
        self.assertEqual(result, [])
        self.assertEqual(candidate['status'], 'INVALIDATED_STRUCTURE_REPLACED')

    def test_no_newer_confirmed_structure_preserves_plan(self):
        candidate = self.fresh({'symbol': 'BTCUSDT', 'client_order_id': 'old', 'structure_event_id': 'btc-old', 'structure_index': 10, 'side': 'SELL'})
        events = {'BTCUSDT': [
            {'event_id': 'btc-new', 'structure_index': 11, 'side': 'SHORT', 'kind': 'FVG', 'confirmation': 'WAITING', 'lifecycle_state': 'ACTIVE'},
        ]}
        result = invalidate_stale_candidates([candidate], {'BTCUSDT': 'btc-new'}, events, now_ms=1000)
        self.assertEqual([x['client_order_id'] for x in result], ['old'])


if __name__ == '__main__':
    unittest.main()
