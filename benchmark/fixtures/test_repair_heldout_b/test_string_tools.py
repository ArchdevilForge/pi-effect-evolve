import unittest
from string_tools import normalize_name

class TestStringTools(unittest.TestCase):
    def test_normalize_name(self):
        self.assertEqual(normalize_name('  ada lovelace '), 'Ada Lovelace')
        self.assertEqual(normalize_name('grace hopper'), 'Grace Hopper')

if __name__ == '__main__':
    unittest.main()
