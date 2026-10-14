import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'v2' / 'scripts'))
from binance_demo_paper_pipeline import rank_and_approve_candidates


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


if __name__ == '__main__':
    unittest.main()
