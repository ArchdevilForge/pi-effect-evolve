import unittest
from stats import sum_total

class TestStats(unittest.TestCase):
    def test_sum_total(self):
        self.assertEqual(sum_total([4, 5, 6]), 15)

if __name__ == '__main__':
    unittest.main()
