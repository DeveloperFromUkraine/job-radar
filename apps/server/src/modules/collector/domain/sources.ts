// The source registry: intervals and published limits (spec §6 Source request rate).
// One read = one request to the source, pages and failed requests included.

export type SourceId =
  | "jobicy"
  | "himalayas"
  | "remotive"
  | "weworkremotely"
  | "justjoinit"
  | "nofluffjobs"
  | "bulldogjob"
  | "pracuj"
  | "theprotocol"
  | "djinni"
  | "dou"
  | "remoteok"
  | "workingnomads"
  | "inhire"
  | "wellfound";

export interface RateLimits {
  perMinute?: number;
  perHour?: number;
  perDay?: number;
}

export interface SourceDefinition {
  id: SourceId;
  name: string;
  siteUrl: string;
  intervalMs: number;
  limits: RateLimits;
  /**
   * The source's published category list, checked 2026-10-02 (AC-24) — static, because fetching it
   * at run time would cost a read. Absent for a source that publishes none (7-day rule instead).
   */
  publishedCategories?: readonly string[];
  /** Its close signal is an expiry date, so even a capped read re-checks closures (ADR-0004). */
  closesByExpiry?: boolean;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const SOURCES: readonly SourceDefinition[] = [
  {
    id: "jobicy",
    name: "Jobicy",
    siteUrl: "https://jobicy.com",
    intervalMs: HOUR,
    limits: { perHour: 1 },
    // GET /api/v2/remote-jobs?get=industries
    publishedCategories: [
      "Admin & Virtual Assistance",
      "Business Development",
      "Content & Editorial",
      "Creative & Design",
      "Customer Support & Success",
      "Cybersecurity",
      "Data Science & Analytics",
      "DevOps & Infrastructure",
      "Education & E-learning",
      "Finance & Accounting",
      "Healthcare & Medical",
      "HR & Recruiting",
      "Legal & Compliance",
      "Marketing & Sales",
      "Product & Operations",
      "Project & Program Management",
      "QA & Testing",
      "Sales",
      "SEO",
      "Software Engineering",
      "Technical Support",
      "Web, UI & UX Design",
    ],
  },
  {
    id: "himalayas",
    name: "Himalayas",
    siteUrl: "https://himalayas.app",
    intervalMs: 6 * HOUR,
    closesByExpiry: true,
    // ≤ 4 a day until spec §8 Q3 verifies the real rate.
    limits: { perDay: 4 },
  },
  {
    id: "remotive",
    name: "Remotive",
    siteUrl: "https://remotive.com",
    intervalMs: 6 * HOUR,
    limits: { perDay: 4, perMinute: 2 },
    // GET /api/remote-jobs/categories
    publishedCategories: [
      "Software Development",
      "Customer Service",
      "Design",
      "Marketing",
      "Sales",
      "Product Management",
      "Project Management",
      "Artificial Intelligence",
      "Data and Analytics",
      "Devops",
      "Finance",
      "Human Resources",
      "Quality Assurance",
      "Writing",
      "Legal",
      "Medical",
      "Teaching",
      "Account Management",
      "Business Development",
      "Communications",
      "Compliance",
      "Engineering",
      "Information Technology",
      "Knowledge Management",
      "Operations",
      "Research",
      "Strategy",
      "Supply Chain",
      "Travel and Hospitality",
      "All others",
    ],
  },
  {
    id: "weworkremotely",
    name: "We Work Remotely",
    siteUrl: "https://weworkremotely.com",
    // No published limit (spec §8 Q1); the feed's own <ttl> is 60 minutes, so hourly is the most
    // that brings new data.
    intervalMs: HOUR,
    limits: { perHour: 1 },
    closesByExpiry: true,
    // The <category> values of https://weworkremotely.com/remote-jobs.rss, read 2026-10-03.
    publishedCategories: [
      "All Other Remote",
      "Back-End Programming",
      "Customer Support",
      "Design",
      "DevOps and Sysadmin",
      "Front-End Programming",
      "Full-Stack Programming",
      "Management and Finance",
      "Product",
      "Sales and Marketing",
    ],
  },
  {
    id: "justjoinit",
    name: "Just Join IT",
    siteUrl: "https://justjoin.it",
    // One request per owner category a run (each page holds that category's newest 50); no
    // published limit, so hourly and at most 6 pages an hour.
    intervalMs: HOUR,
    limits: { perHour: 6 },
    closesByExpiry: true,
    // The category slugs of https://justjoin.it/job-offers/all-locations/<slug>, read 2026-10-17.
    publishedCategories: [
      "javascript",
      "html",
      "php",
      "ruby",
      "python",
      "java",
      "net",
      "scala",
      "c",
      "mobile",
      "testing",
      "devops",
      "admin",
      "ux",
      "pm",
      "game",
      "analytics",
      "security",
      "data",
      "go",
      "support",
      "erp",
      "architecture",
      "other",
      "ai",
    ],
  },
  {
    id: "nofluffjobs",
    name: "No Fluff Jobs",
    siteUrl: "https://nofluffjobs.com",
    // One or two requests per owner category a run (the search's pages are cumulative); no
    // published limit, so hourly and at most 10 an hour.
    intervalMs: HOUR,
    limits: { perHour: 10 },
    // The category paths of https://nofluffjobs.com/pl/praca-zdalna/<category>, each checked 2026-10-17
    // (an unknown path becomes a keyword search instead).
    publishedCategories: [
      "frontend",
      "fullstack",
      "backend",
      "mobile",
      "embedded",
      "testing",
      "devops",
      "architecture",
      "security",
      "game-dev",
      "artificial-intelligence",
      "support",
      "agile",
      "product-management",
      "project-manager",
      "business-intelligence",
      "business-analyst",
      "ux",
      "erp",
    ],
  },
  {
    id: "bulldogjob",
    name: "Bulldogjob",
    siteUrl: "https://bulldogjob.pl",
    // One request per owner role a run; no published limit, so hourly and at most 6 an hour.
    intervalMs: HOUR,
    limits: { perHour: 6 },
    // Roles of https://bulldogjob.pl/companies/jobs/s/city,Remote/role,<role> that held jobs on
    // 2026-10-17 (an unknown role answers with none, so only roles seen with jobs are listed).
    publishedCategories: [
      "frontend",
      "fullstack",
      "backend",
      "devops",
      "tester",
      "qa",
      "mobile",
      "analyst",
      "architect",
      "project_manager",
      "support",
      "data",
      "designer",
      "embedded",
      "ai",
    ],
  },
  // Pracuj.pl and theprotocol.it answer programs with a bot check: job-radar never fetches them. Their
  // listings come from the owner's own look in their browser, written to an import file
  // (infra/sources/imported.ts); a run only reads that file, so it is read every 10 minutes and a fresh
  // import shows up soon.
  {
    id: "pracuj",
    name: "Pracuj.pl",
    siteUrl: "https://it.pracuj.pl",
    intervalMs: 10 * MINUTE,
    limits: { perHour: 6 },
    closesByExpiry: true,
    publishedCategories: ["frontend", "fullstack", "backend", "mobile", "devops", "testing", "data"],
  },
  {
    id: "theprotocol",
    name: "theprotocol.it",
    siteUrl: "https://theprotocol.it",
    intervalMs: 10 * MINUTE,
    limits: { perHour: 6 },
    closesByExpiry: true,
    publishedCategories: ["frontend", "fullstack", "backend", "mobile", "devops", "testing", "data"],
  },
  {
    id: "djinni",
    name: "Djinni",
    siteUrl: "https://djinni.co",
    // One RSS request per owner category a run; no published limit, so hourly and at most 4 an hour.
    intervalMs: HOUR,
    limits: { perHour: 4 },
    closesByExpiry: true,
    // `primary_keyword` values that answered with their own jobs on 2026-10-17 (an unknown one answers
    // with every job, which the adapter drops).
    publishedCategories: ["JavaScript", "Fullstack", "Node.js", "React.js"],
  },
  {
    id: "dou",
    name: "DOU",
    siteUrl: "https://jobs.dou.ua",
    // One RSS request per owner category a run; no published limit, so hourly and at most 4 an hour.
    intervalMs: HOUR,
    limits: { perHour: 4 },
    closesByExpiry: true,
    // Categories that answered with remote jobs on 2026-10-17 (an unknown one answers with none).
    publishedCategories: ["Front End", "JavaScript", "Node.js", "Fullstack"],
  },
  {
    id: "remoteok",
    name: "Remote OK",
    siteUrl: "https://remoteok.com",
    // One API request a run for the newest ~100 jobs; hourly.
    intervalMs: HOUR,
    limits: { perHour: 1 },
    closesByExpiry: true,
  },
  {
    id: "workingnomads",
    name: "Working Nomads",
    siteUrl: "https://www.workingnomads.com",
    // One API request a run for the newest jobs; hourly.
    intervalMs: HOUR,
    limits: { perHour: 1 },
    closesByExpiry: true,
    // The `category_name` values seen on 2026-10-17.
    publishedCategories: [
      "Development",
      "Administration",
      "Customer Success",
      "Marketing",
      "Writing",
      "Sales",
      "Design",
      "Education",
    ],
  },
  {
    id: "inhire",
    name: "inhire.io",
    siteUrl: "https://inhire.io",
    // Every offer in up to 15 POSTs of 50 (about 7 on 2026-10-17); slow-moving, so every 6 hours.
    intervalMs: 6 * HOUR,
    limits: { perHour: 15 },
    closesByExpiry: true,
    // The `roles` values seen on 2026-10-17.
    publishedCategories: [
      "frontend_developer",
      "full_stack_developer",
      "backend_developer",
      "mobile_developer",
      "team_leader",
      "architect",
      "devops_engineer",
      "testing",
      "data_science",
      "big_data",
      "business_analyst",
      "project_manager",
      "ux_designer",
      "security_engineer",
    ],
  },
  {
    id: "wellfound",
    name: "Wellfound",
    siteUrl: "https://wellfound.com",
    // One page per owner role; startup jobs move slowly, so every 6 hours and at most 4 an hour.
    intervalMs: 6 * HOUR,
    limits: { perHour: 4 },
    closesByExpiry: true,
    // `/role/r/<role>` paths that answered with jobs on 2026-10-17 (an unknown one redirects).
    publishedCategories: ["frontend-engineer", "full-stack-engineer", "software-engineer", "react-developer"],
  },
];

export function sourceById(id: SourceId): SourceDefinition {
  const source = SOURCES.find((s) => s.id === id);
  if (!source) throw new Error(`unknown source ${id}`);
  return source;
}

export function hasZeroRate(source: SourceDefinition): boolean {
  const { perMinute, perHour, perDay } = source.limits;
  return perMinute === 0 || perHour === 0 || perDay === 0;
}
