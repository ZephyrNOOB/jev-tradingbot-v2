import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'v2' / 'scripts'))
# pyright: reportMissingImports=false
from binance_demo_live_pipeline import rank_and_approve_candidates, preserve_active_plan, assert_candidate_contract


class CandidateRankingTests(unittest.TestCase):
    def test_approves_latest_confirmed_structure_candidate_per_pair(self):
        candidates = [
            {'symbol': 'BTCUSDT', 'client_order_id': 'old', 'structure_event_id': 'btc-old', 'structure_index': 10, 'confirmation_index': 20},
            {'symbol': 'BTCUSDT', 'client_order_id': 'new', 'structure_event_id': 'btc-new', 'structure_index': 12, 'confirmation_index': 30},
        ]
        result = rank_and_approve_candidates(candidates, {'BTCUSDT': 'btc-new'})
        self.assertEqual([x['client_order_id'] for x in result], ['new'])
        self.assertEqual(candidates[0]['status'], 'REJECTED_LOWER_STRUCTURE_RANK')
        self.assertEqual(candidates[1]['status'], 'APPROVED_FOR_EXECUTION')

    def test_rejects_ambiguous_tie_instead_of_list_order(self):
        candidates = [
            {'symbol': 'BTCUSDT', 'client_order_id': 'a', 'structure_event_id': 'btc-current', 'structure_index': 12, 'confirmation_index': 30},
            {'symbol': 'BTCUSDT', 'client_order_id': 'b', 'structure_event_id': 'btc-current', 'structure_index': 12, 'confirmation_index': 30},
        ]
        self.assertEqual(rank_and_approve_candidates(candidates, {'BTCUSDT': 'btc-current'}), [])
        self.assertTrue(all(x['status'] == 'REJECTED_AMBIGUOUS_CANDIDATE' for x in candidates))

    def test_keeps_existing_plan_when_structure_is_same_but_entry_moves(self):
        previous = {'symbol': 'BTCUSDT', 'client_order_id': 'jev_old', 'structure_event_id': 'btc-current', 'side': 'BUY', 'entry': 100.0}
        refreshed = {'symbol': 'BTCUSDT', 'client_order_id': 'jev_new', 'structure_event_id': 'btc-current', 'side': 'BUY', 'entry': 101.0, 'confirmation_event_id': 'new-confirmation'}
        result = preserve_active_plan(previous, refreshed)
        self.assertEqual(result['client_order_id'], 'jev_old')
        self.assertEqual(result['entry'], 100.0)
        self.assertEqual(result['status'], 'APPROVED_FOR_EXECUTION')

    def test_replaces_plan_when_structure_event_changes(self):
        previous = {'symbol': 'BTCUSDT', 'client_order_id': 'jev_old', 'structure_event_id': 'btc-old', 'side': 'BUY', 'setup_id': 'FVG'}
        refreshed = {'symbol': 'BTCUSDT', 'client_order_id': 'jev_new', 'structure_event_id': 'btc-new', 'side': 'BUY', 'setup_id': 'FVG', 'entry': 101.0}
        result = preserve_active_plan(previous, refreshed)
        self.assertEqual(result['client_order_id'], 'jev_new')

    def test_rejects_malformed_candidate_contract(self):
        with self.assertRaisesRegex(ValueError, 'CANDIDATE_CONTRACT_MISSING'):
            assert_candidate_contract({'symbol': 'BTCUSDT', 'side': 'BUY'})

    def test_accepts_complete_candidate_contract(self):
        candidate = {'client_order_id': 'jev_1', 'symbol': 'BTCUSDT', 'structure_event_id': 'e1', 'confirmation_index': 4, 'created_at_ms': 1000, 'side': 'BUY', 'entry': 100.0, 'sl': 99.0, 'tp': 102.0, 'status': 'APPROVED_FOR_EXECUTION', 'setup_id': 'FVG'}
        self.assertIs(assert_candidate_contract(candidate), candidate)


if __name__ == '__main__':
    unittest.main()
