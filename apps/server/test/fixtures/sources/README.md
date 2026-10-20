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
- `djinni/javascript.xml` — built from `GET https://djinni.co/jobs/rss/?primary_keyword=JavaScript` and the unfiltered feed on 2026-10-17: two JavaScript items and one Project Manager item (an unknown keyword answers with every job), links renumbered, descriptions shortened.
- `dou/front-end.xml` — from `GET https://jobs.dou.ua/vacancies/feeds/?category=Front%20End&remote` on 2026-10-17: one item with pay in the title, one without; companies and links anonymised.
- `remoteok/api.json` — from `GET https://remoteok.com/api` on 2026-10-17: the legal notice plus two jobs (one with pay, one with no location); companies, ids and links anonymised.
- `workingnomads/jobs.json` — from `GET https://www.workingnomads.com/api/exposed_jobs/` on 2026-10-17: one Development and one Marketing job, anonymised.
- `inhire/offers.json` — from `POST https://inhire.io/getAllOffersNonAuth` with `{"page":1}` on 2026-10-17 (50 offers): two remote offers (frontend, full-stack) and one Warsaw-only offer, companies, ids and links anonymised; `time_to_expiry_in_hours` set to 100, 200 and 300.
- `wellfound/frontend-engineer.html` — from `GET https://wellfound.com/role/r/frontend-engineer` on 2026-10-17 (28 jobs in the page's Apollo state): two jobs (one named by its startup's `highlightedJobListings`, one with accepted remote locations) and that startup, descriptions shortened, company anonymised.
- `ats/` — company job boards, from `GET https://boards-api.greenhouse.io/v1/boards/vercel/jobs?content=true`,
  `GET https://api.lever.co/v0/postings/spotify?mode=json` and `GET https://api.ashbyhq.com/posting-api/job-board/linear?includeCompensation=true`
  on 2026-10-20: three jobs from each kept with their ids, field names and shapes; titles, locations and
  pay set for the cases tested (remote / hybrid / on-site, an unlisted Ashby job), companies and links
  anonymised, descriptions shortened. Greenhouse's `content` stays entity-escaped as the API sends it.
