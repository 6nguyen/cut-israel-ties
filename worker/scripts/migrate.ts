// Columns added after a database was provisioned (deployment spec §3: schema.sql runs once, so later
// columns arrive here). `seed-remote.ts` reads PRAGMA table_info and applies only the missing ones;
// local `npm run seed` reapplies schema.sql, so it never needs this.
export interface ColumnMigration { table: string; column: string; ddl: string }

export const MIGRATIONS: ColumnMigration[] = [
  // urgency-and-readability §4
  { table: 'goals', column: 'decision_at', ddl: 'ALTER TABLE goals ADD COLUMN decision_at TEXT;' },
  { table: 'goals', column: 'decision_date_confirmed', ddl: 'ALTER TABLE goals ADD COLUMN decision_date_confirmed INTEGER NOT NULL DEFAULT 0;' },
];

/** The column names a `PRAGMA table_info(<table>)` --json result lists; [] when the table is missing or the output is not JSON. */
export function columnsOf(out: string): string[] {
  const start = out.indexOf('[');
  if (start < 0) return [];
  try {
    const parsed = JSON.parse(out.slice(start)) as { results?: { name?: unknown }[] }[];
    return (parsed[0]?.results ?? []).map((r) => r.name).filter((n): n is string => typeof n === 'string');
  } catch {
    return [];
  }
}

/** The migrations whose column the table lacks; none when the table itself is absent (schema.sql creates it whole). */
export function pending(existing: Record<string, string[]>, migrations = MIGRATIONS): ColumnMigration[] {
  return migrations.filter((m) => existing[m.table]?.length && !existing[m.table].includes(m.column));
}
