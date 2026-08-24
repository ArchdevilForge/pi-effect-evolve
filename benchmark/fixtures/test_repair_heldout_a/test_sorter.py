import unittest
from data_sorter import sort_descending

class TestSorter(unittest.TestCase):
    def test_sort(self):
        self.assertEqual(sort_descending([3, 1, 4, 1, 5]), [5, 4, 3, 1, 1])

if __name__ == '__main__':
    unittest.main()
