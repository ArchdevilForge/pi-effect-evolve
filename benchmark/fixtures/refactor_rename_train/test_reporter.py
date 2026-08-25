import unittest
from reporter import make_report

class TestReporter(unittest.TestCase):
    def test_make_report(self):
        self.assertEqual(make_report([2, 3]), {'count': 2, 'total': 5})

if __name__ == '__main__':
    unittest.main()
