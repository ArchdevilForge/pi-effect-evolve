import unittest
from billing_client import get_invoice

class NewBillingApi:
    def fetch_invoice(self, invoice_id):
        return {'id': invoice_id, 'total': 42}

class TestBillingClient(unittest.TestCase):
    def test_migrates_to_new_api(self):
        self.assertEqual(get_invoice(NewBillingApi(), 'i-1')['total'], 42)

if __name__ == '__main__':
    unittest.main()
