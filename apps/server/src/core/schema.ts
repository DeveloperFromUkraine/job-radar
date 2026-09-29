// Anchor for drizzle-kit so its schema glob resolves before any module owns a table.
// Tables live in each module's infra/schema.ts, never here.
export {};
