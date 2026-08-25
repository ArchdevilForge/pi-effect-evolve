import unittest
from legacy_client import get_user

class NewApi:
    def fetch_user(self, user_id):
        return {'id': user_id, 'name': 'Ada'}

class TestClient(unittest.TestCase):
    def test_migrates_to_new_api(self):
        self.assertEqual(get_user(NewApi(), 7)['name'], 'Ada')

if __name__ == '__main__':
    unittest.main()
