import unittest
from stage_public_site import ROOT, build_plan, verify, review_slug, rewrite_links


class PublicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan, cls.eligible, cls.manuscripts, _ = build_plan(ROOT)

    def test_publication_matches_full_corpus_decisions(self):
        self.assertEqual([], verify(self.plan, self.eligible, self.manuscripts))
        self.assertTrue(self.eligible)
        self.assertTrue(self.manuscripts)
        self.assertTrue(all((ROOT / p).is_file() for p in self.manuscripts))

    def test_accidental_manuscript_publication_fails(self):
        plan = dict(self.plan)
        name = next(iter(self.manuscripts))
        plan[name] = (ROOT / name).read_bytes()
        self.assertTrue(verify(plan, self.eligible, self.manuscripts))

    def test_missing_good_review_fails(self):
        plan = dict(self.plan)
        del plan['reviews/' + next(iter(self.eligible)) + '.html']
        self.assertTrue(verify(plan, self.eligible, self.manuscripts))

    def test_route_normalization(self):
        self.assertEqual('example', review_slug('https://www.qutaifan.com/reviews/example.html?x=1'))
        self.assertEqual('example', review_slug('/reviews/example/'))
        self.assertIsNone(review_slug('https://elsewhere.example/reviews/example'))

    def test_retired_review_link_discloses_official_destination(self):
        text, count = rewrite_links('<p><a href="/reviews/example">Full review</a></p>',
                                    {'example': 'https://example.org/'})
        self.assertEqual(1, count)
        self.assertIn('href="https://example.org/"', text)
        self.assertIn('Official product details', text)


if __name__ == '__main__':
    unittest.main()
