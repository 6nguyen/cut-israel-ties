import type { RouteResponse } from '@worker/route';
export type { RouteResponse, GoalCard, TargetCard } from '@worker/route';

export interface ApiError { error: string; message: string; status: number }

export async function route(body: { address?: string; state?: string; district?: number; by_location?: boolean; by_suggestion?: boolean; turnstile?: string }): Promise<RouteResponse> {
  const res = await fetch('/api/route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({ error: 'bad_response', message: 'The server sent something we could not read.' }))) as Partial<ApiError>;
  if (!res.ok) throw Object.assign(new Error(data.message ?? 'Request failed'), { error: data.error ?? 'unknown', status: res.status }) as ApiError & Error;
  return data as unknown as RouteResponse;
}

export function districtLabel(state: string, district: number): string {
  return district === 0 ? `${state} at large` : `${state}-${String(district).padStart(2, '0')}`;
}
