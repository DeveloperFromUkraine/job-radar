# Source fixtures

Responses each adapter is tested against. Companies and links are anonymised to `example.test`.

- `jobicy/` — built from the documented response schema (github.com/Jobicy/remote-jobs-api README,
  "Response Fields", read 2026-10-02), not recorded live: Jobicy allows one request per hour and the
  hour was already used. Replace with a recorded response when convenient.
- `himalayas/` — recorded from `GET https://himalayas.app/jobs/api?limit=20` on 2026-10-02, then anonymised.
- `weworkremotely/` — recorded from `GET https://weworkremotely.com/remote-jobs.rss` on 2026-10-03 (89 items, 2.2 MB), four items kept (a country list, "Anywhere in the World" with no country, a region only, `&amp;` in the title) and anonymised; descriptions shortened.
- `remotive/` — recorded from `GET https://remotive.com/api/remote-jobs` on 2026-10-02 (17 jobs, 197 KB), three jobs kept and anonymised; `truncated.json` sets `total-job-count` above `job-count`.
