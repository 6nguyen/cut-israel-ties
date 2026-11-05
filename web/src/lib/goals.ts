// Build-time read of data/goals for the stub pages §2 will replace.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export interface GoalStub { slug: string; title: string; summary: string; category: string; status: string; priority: number; decision_date: string | null }

export function loadGoals(): GoalStub[] {
  const dir = join(process.cwd(), '..', 'data', 'goals');
  return readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort().map((f) => {
    const y = parse(readFileSync(join(dir, f), 'utf8')) as Record<string, unknown>;
    return { slug: String(y.slug), title: String(y.title), summary: String(y.summary), category: String(y.category), status: String(y.status), priority: Number(y.priority), decision_date: y.decision_date ? String(y.decision_date) : null };
  }).sort((a, b) => b.priority - a.priority || a.slug.localeCompare(b.slug));
}
