// The source registry: intervals and published limits (spec §6 Source request rate).
// One read = one request to the source, pages and failed requests included.

export type SourceId = "jobicy" | "himalayas" | "remotive" | "weworkremotely";

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
}

const HOUR = 60 * 60 * 1000;

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
    intervalMs: 6 * HOUR,
    // 0 — not read until spec §8 Q1 sets its verified limit.
    limits: { perDay: 0 },
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
