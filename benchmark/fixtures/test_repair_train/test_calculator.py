import unittest
from calculator import add, divide

class TestCalc(unittest.TestCase):
    def test_divide(self):
        self.assertEqual(divide(10, 2), 5.0)
        self.assertEqual(divide(9, 3), 3.0)

if __name__ == '__main__':
    unittest.main()
