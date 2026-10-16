# Source fixtures

Responses each adapter is tested against. Companies and links are anonymised to `example.test`.

- `jobicy/` — built from the documented response schema (github.com/Jobicy/remote-jobs-api README,
  "Response Fields", read 2026-10-02), not recorded live: Jobicy allows one request per hour and the
  hour was already used. Replace with a recorded response when convenient. Job 900003 carries
  `salaryMin`/`salaryMax`/`salaryCurrency` as the live v2 API sends them (checked 2026-10-16, realness-score sad §4);
  the other two have none.
- `himalayas/` — recorded from `GET https://himalayas.app/jobs/api?limit=20` on 2026-10-02, then anonymised.
- `weworkremotely/` — recorded from `GET https://weworkremotely.com/remote-jobs.rss` on 2026-10-03 (89 items, 2.2 MB), four items kept (a country list, "Anywhere in the World" with no country, a region only, `&amp;` in the title) and anonymised; descriptions shortened.
- `remotive/` — recorded from `GET https://remotive.com/api/remote-jobs` on 2026-10-02 (17 jobs, 197 KB), three jobs kept and anonymised; `truncated.json` sets `total-job-count` above `job-count`.
- `justjoinit/` — recorded from `GET https://justjoin.it/job-offers/all-locations/javascript?remote=yes` on 2026-10-17 (50 offers in the page's RSC payload, 1.6 MB). Three offers kept (pay in EUR per year, no pay amount, PLN per month) and anonymised, with the body shortened; the payload is re-wrapped in two `self.__next_f.push` chunks, compact JSON like the live page.
- `nofluffjobs/` — built from `GET https://nofluffjobs.com/pl/praca-zdalna/frontend?page=2` on 2026-10-17 (21 postings in the page's `serverApp-state` JSON). Three postings kept (pay per hour, renewed; pay per hour; salary hidden until the last interview) and anonymised. `frontend-page1.html` holds the first two with `totalCount` 3 and page size 2; `frontend-page2.html` holds all three, as the board's cumulative pages do.
- `bulldogjob/` — built from `GET https://bulldogjob.pl/companies/jobs/s/city,Remote/role,frontend` on 2026-10-17 (8 jobs in the page's `__NEXT_DATA__`). Three jobs kept (two with pay, one intern role without) and anonymised; Apollo state and locations dropped. `frontend.html` has `totalCount` 3, `frontend-capped.html` the same jobs with `totalCount` 5.
