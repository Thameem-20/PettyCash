import { query } from "./db";

/** Field staff listed in the reports messenger filter. */
export async function getReportMessengers(): Promise<{ id: number; name: string }[]> {
  return query<{ id: number; name: string }>(
    `SELECT id, name FROM users
      WHERE role IN ('cash_requester', 'operations', 'messenger') AND is_active = 1
      ORDER BY name`
  );
}
