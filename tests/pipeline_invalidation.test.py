import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'v2' / 'scripts'))
from binance_demo_paper_pipeline import invalidate_stale_candidates


class CandidateInvalidationTests(unittest.TestCase):
    def test_only_latest_structure_event_remains_active(self):
        candidates = [
            {'symbol': 'BTCUSDT', 'client_order_id': 'old', 'structure_event_id': 'btc-old'},
            {'symbol': 'BTCUSDT', 'client_order_id': 'new', 'structure_event_id': 'btc-new'},
            {'symbol': 'ETHUSDT', 'client_order_id': 'eth', 'structure_event_id': 'eth-old'},
        ]
        result = invalidate_stale_candidates(candidates, {'BTCUSDT': 'btc-new', 'ETHUSDT': 'eth-new'})
        self.assertEqual([x['client_order_id'] for x in result], ['new'])
        self.assertEqual(candidates[0]['status'], 'INVALIDATED_STRUCTURE_UPDATED')
        self.assertEqual(candidates[2]['status'], 'INVALIDATED_STRUCTURE_UPDATED')

    def test_empty_latest_event_keeps_no_candidate(self):
        candidate = {'symbol': 'BTCUSDT', 'client_order_id': 'old', 'structure_event_id': 'btc-old'}
        result = invalidate_stale_candidates([candidate], {'BTCUSDT': None})
        self.assertEqual(result, [])
        self.assertEqual(candidate['status'], 'INVALIDATED_NO_ACTIVE_STRUCTURE')


if __name__ == '__main__':
    unittest.main()
