import unittest
from profile_client import get_profile

class NewProfileApi:
    def fetch_profile(self, user_id):
        return {'id': user_id, 'plan': 'pro'}

class TestProfileClient(unittest.TestCase):
    def test_migrates_to_new_api(self):
        self.assertEqual(get_profile(NewProfileApi(), 'u-2')['plan'], 'pro')

if __name__ == '__main__':
    unittest.main()
