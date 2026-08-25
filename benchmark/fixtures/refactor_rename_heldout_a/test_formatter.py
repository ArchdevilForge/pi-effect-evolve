import unittest
from formatter import render_user

class TestFormatter(unittest.TestCase):
    def test_render_user(self):
        self.assertEqual(render_user({'name': ' Ada '}), 'Ada')

if __name__ == '__main__':
    unittest.main()
