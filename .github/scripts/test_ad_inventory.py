"""Regression tests for refusing ads on held-back editorial inventory."""
import unittest

from compliance import check_ad_free_inventory, check_adsense_loader, PUB


class AdInventoryTests(unittest.TestCase):
    def test_account_verification_and_editorial_content_are_not_ads(self):
        self.assertEqual([], check_ad_free_inventory(
            f'<head><meta name="google-adsense-account" content="{PUB}"></head>'
            '<body><p>Advertising is disabled pending editorial work.</p></body>'))

    def test_loader_detected_with_single_quotes_and_reordered_attributes(self):
        self.assertTrue(check_ad_free_inventory(
            "<script crossorigin='anonymous' src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js' async></script>"))

    def test_manual_unit_detected_with_multiple_classes(self):
        self.assertTrue(check_ad_free_inventory("<ins class='reserved adsbygoogle'></ins>"))

    def test_ad_initialization_detected_without_loader(self):
        self.assertTrue(check_ad_free_inventory('<script>window.adsbygoogle.push({});</script>'))

    def test_editorial_mention_does_not_count_as_executable_code(self):
        self.assertEqual([], check_ad_free_inventory('<p>adsbygoogle</p>'))

    def test_eligible_pages_still_require_loader(self):
        self.assertTrue(check_adsense_loader(
            f'<head><meta name="google-adsense-account" content="{PUB}"></head>'))


if __name__ == '__main__':
    unittest.main()
