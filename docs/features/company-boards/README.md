# Company job boards

Status: shipped 2026-10-20 · source id `ats` · code: `collector/domain/ats.ts`, `collector/infra/sources/ats.ts`,
`collector/app/companies.ts`, `web/src/features/source-health/CompaniesCard.tsx`.

## What it does

Reads remote roles straight from companies' own applicant-tracking boards — Greenhouse, Lever and Ashby —
through their public job-board APIs (no key; made for showing a company's roles on other sites). A role
there is usually listed before the job boards copy it, and the link goes to the employer's own form.

## Where the companies come from

| Origin | How | Cost |
|---|---|---|
| `link` | Board links found in collected listings (apply links, descriptions) | free |
| `probe` | Board names guessed from collected companies' names (`slugGuesses`), tried on all three systems; a 404 means no board. Each name is probed once. 18 of 40 sampled companies answered on 2026-10-20 | up to 6 requests a name |
| `theirstack` | One TheirStack jobs search a day (`THEIRSTACK_API_KEY`), whose links lead to the boards | 1 credit a job, 6 a day |
| `manual` | The owner adds a board link or a company site on Source health; a site's home, /careers and /jobs pages are searched for a board link, then its name is guessed | a few requests |

A company the owner removes stays removed: discovery never adds it back.

## Reading

Hourly, at most 100 requests an hour: one read marks the run, then up to 60 boards (longest unread
first), then name probes with the hour's remaining reads. Only remote roles are kept (Greenhouse:
"remote" in the location or title; Lever: `workplaceType` remote; Ashby: `isRemote` or workplace type
Remote), sorted into roles by title (`rolesOf`); the owner's default roles are frontend and fullstack.

- **No publication time.** A board lists only roles still being filled, and evergreen roles keep their
  first date for years, so a role counts from when it was found (search's 30-day limit).
- **Closes by expiry.** Each read sets a role's expiry 7 days ahead; a role its board stops listing
  closes a week after its last read. The read is always `capped`.

## Known limits

- A common word as a company name (Upgrade, Socket) can match another company's board — remove it on
  the list.
- Workday, SmartRecruiters, Workable, Recruitee and Personio are not read yet; same shape, one parser each.
