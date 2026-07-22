import { NextRequest } from "next/server";
import { fail, ok, requireApiSession } from "@/lib/api";
import { query } from "@/lib/db";
import { getCompassionBranch } from "@/lib/compassion";

export const dynamic = "force-dynamic";

function mergeSuggestions(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const v of list) {
      const key = v.trim();
      if (!key || seen.has(key.toLowerCase())) continue;
      seen.add(key.toLowerCase());
      out.push(key);
      if (out.length >= 20) return out;
    }
  }
  return out;
}

/** Suggest Compassion presets + prior values for the current user. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireApiSession([
      "cash_requester",
      "messenger",
      "operations",
      "admin",
    ]);
    const field = String(req.nextUrl.searchParams.get("field") || "");
    const q = String(req.nextUrl.searchParams.get("q") || "").trim();
    if (!["truck", "trailer", "description"].includes(field)) {
      return ok({ suggestions: [] });
    }
    // Require typed text so the UI only shows matching options while entering.
    if (!q) return ok({ suggestions: [] });

    const like = `%${q}%`;
    const presets = await query<{ v: string }>(
      `SELECT value AS v FROM compassion_presets
        WHERE kind = ? AND is_active = 1 AND value LIKE ?
        ORDER BY value ASC
        LIMIT 20`,
      [field, like]
    );

    const branch = await getCompassionBranch();
    let history: { v: string }[] = [];

    if (branch) {
      if (field === "truck") {
        history = await query<{ v: string }>(
          `SELECT DISTINCT ch.truck_number AS v
             FROM request_charges ch
             JOIN petty_cash_requests r ON r.id = ch.request_id
            WHERE r.branch_id = ?
              AND r.submitted_by_user_id = ?
              AND ch.truck_number IS NOT NULL AND TRIM(ch.truck_number) <> ''
              AND ch.truck_number LIKE ?
            ORDER BY ch.truck_number ASC
            LIMIT 12`,
          [branch.id, session.id, like]
        );
      } else if (field === "trailer") {
        history = await query<{ v: string }>(
          `SELECT DISTINCT ch.trailer_number AS v
             FROM request_charges ch
             JOIN petty_cash_requests r ON r.id = ch.request_id
            WHERE r.branch_id = ?
              AND r.submitted_by_user_id = ?
              AND ch.trailer_number IS NOT NULL AND TRIM(ch.trailer_number) <> ''
              AND ch.trailer_number LIKE ?
            ORDER BY ch.trailer_number ASC
            LIMIT 12`,
          [branch.id, session.id, like]
        );
      } else {
        history = await query<{ v: string }>(
          `SELECT DISTINCT ch.description AS v
             FROM request_charges ch
             JOIN petty_cash_requests r ON r.id = ch.request_id
            WHERE r.branch_id = ?
              AND r.submitted_by_user_id = ?
              AND r.charge_type IN ('truck_trailer','general')
              AND ch.description IS NOT NULL AND TRIM(ch.description) <> ''
              AND ch.description LIKE ?
            ORDER BY ch.description ASC
            LIMIT 12`,
          [branch.id, session.id, like]
        );
      }
    }

    return ok({
      suggestions: mergeSuggestions(
        presets.map((r) => r.v),
        history.map((r) => r.v)
      ),
    });
  } catch (err) {
    return fail(err);
  }
}
