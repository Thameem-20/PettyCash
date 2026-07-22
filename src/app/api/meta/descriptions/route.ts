import { NextRequest } from "next/server";
import { fail, ok, requireApiSession } from "@/lib/api";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Split glued "1. A\\n2. B" / "1. A2. B" into individual charge texts. */
function explodeDescriptions(raw: string): string[] {
  const text = raw.trim();
  if (!text) return [];

  let parts = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    parts = text
      .split(/(?=\d+\.\s)/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return parts.map((p) => p.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
}

/** Autocomplete from individual charge descriptions + category names. */
export async function GET(req: NextRequest) {
  try {
    await requireApiSession();
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 1) return ok({ suggestions: [] });

    const like = `%${q}%`;

    const fromCharges = await query<{ text: string }>(
      `SELECT DISTINCT description AS text
         FROM request_charges
        WHERE description IS NOT NULL AND TRIM(description) != ''
          AND LOWER(description) LIKE LOWER(?)
        ORDER BY description
        LIMIT 40`,
      [like]
    );

    const fromCategories = await query<{ text: string }>(
      `SELECT DISTINCT category_name AS text
         FROM expense_categories
        WHERE is_active = 1 AND LOWER(category_name) LIKE LOWER(?)
        ORDER BY category_name
        LIMIT 20`,
      [like]
    );

    // Legacy parent descriptions may still be numbered concatenations — explode them.
    const fromRequests = await query<{ text: string }>(
      `SELECT DISTINCT description AS text
         FROM petty_cash_requests
        WHERE description IS NOT NULL AND TRIM(description) != ''
          AND LOWER(description) LIKE LOWER(?)
        ORDER BY description
        LIMIT 30`,
      [like]
    );

    const lower = q.toLowerCase();
    const seen = new Set<string>();
    const suggestions: string[] = [];

    function add(text: string) {
      const t = text.trim();
      if (!t) return;
      // Only keep suggestions that actually contain the typed text.
      if (!t.toLowerCase().includes(lower)) return;
      const key = t.toLowerCase();
      if (seen.has(key)) return;
      // Skip whole concatenated blobs; prefer exploded lines.
      if (/^\d+\.\s/.test(t) && /\d+\.\s/.test(t.slice(3))) return;
      seen.add(key);
      suggestions.push(t);
    }

    for (const row of fromCategories) add(row.text);
    for (const row of fromCharges) add(row.text);
    for (const row of fromRequests) {
      for (const part of explodeDescriptions(row.text)) add(part);
    }

    suggestions.sort((a, b) => {
      const ap = a.toLowerCase().startsWith(lower) ? 0 : 1;
      const bp = b.toLowerCase().startsWith(lower) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.localeCompare(b);
    });

    return ok({ suggestions: suggestions.slice(0, 12) });
  } catch (err) {
    return fail(err);
  }
}
