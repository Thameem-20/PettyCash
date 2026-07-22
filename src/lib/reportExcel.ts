import * as XLSX from "xlsx-js-style";
import type { ReportColumn, ReportResult } from "./reports";
import { formatDateOnly } from "./util";

const HEADER_STYLE = {
  fill: { patternType: "solid" as const, fgColor: { rgb: "FFFF00" } },
  font: { bold: true, color: { rgb: "000000" } },
  alignment: { vertical: "center" as const, horizontal: "center" as const, wrapText: true },
};

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, " ").trim();
  return (cleaned || "Report").slice(0, 31);
}

function isDateColumn(col: ReportColumn): boolean {
  return col.key.endsWith("_at") || col.key === "date";
}

function cellValue(value: unknown, col: ReportColumn): string | number {
  if (value == null || value === "") return "";
  if (col.money) {
    const n = Number(value);
    return Number.isFinite(n) ? n : "";
  }
  if (isDateColumn(col)) {
    const formatted = formatDateOnly(String(value));
    return formatted === "-" ? "" : formatted;
  }
  return String(value);
}

function displayLen(value: string | number): number {
  return String(value ?? "").length;
}

type ChargeLine = {
  description: string;
  job_number: string;
  truck_number?: string;
  trailer_number?: string;
  driver_name?: string;
  amount: number;
};

const COMBINED_LIST_KEYS = [
  "description",
  "job_number",
  "truck_numbers",
  "trailer_numbers",
  "driver_names",
] as const;

/** Combined export: one physical Excel row; collapse multiline text to a single line. */
function flattenCombinedRow(row: Record<string, unknown>): Record<string, unknown> {
  const next = { ...row };
  for (const key of COMBINED_LIST_KEYS) {
    const v = next[key];
    if (typeof v === "string" && (v.includes("\n") || v.includes(","))) {
      if (key === "description") {
        next[key] = v
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" · ");
      } else {
        next[key] = v
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .join(", ");
      }
    }
  }
  // Drop internal breakdown payload from the sheet.
  delete next._charges;
  return next;
}

/**
 * Detailed export: one Excel row per charge, repeating request_no and shared fields.
 */
function expandDetailedRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    const charges = Array.isArray(row._charges) ? (row._charges as ChargeLine[]) : null;
    if (!charges || charges.length === 0) {
      const copy = { ...row };
      delete copy._charges;
      out.push(copy);
      continue;
    }
    for (const ch of charges) {
      out.push({
        ...row,
        description: ch.description || "",
        job_number: ch.job_number || "",
        truck_numbers: ch.truck_number || "",
        trailer_numbers: ch.trailer_number || "",
        driver_names: ch.driver_name || "",
        amount: Number(ch.amount),
        _charges: undefined,
      });
    }
  }
  return out.map((r) => {
    const copy = { ...r };
    delete copy._charges;
    return copy;
  });
}

/**
 * Screen lists newest-first; Excel wants oldest first (first record on top).
 * Combined → one row per request.
 * Detailed → one row per charge (request no repeated).
 */
function prepareExcelRows(
  rows: Record<string, unknown>[],
  detailed: boolean
): Record<string, unknown>[] {
  const chronological = [...rows].reverse();
  if (detailed) return expandDetailedRows(chronological);
  return chronological.map(flattenCombinedRow);
}

function appendSectionSheet(
  wb: XLSX.WorkBook,
  title: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  detailed: boolean
) {
  const exportRows = prepareExcelRows(rows, detailed);

  const header = columns.map((c) => ({
    v: c.label,
    t: "s" as const,
    s: HEADER_STYLE,
  }));

  const body = exportRows.map((row) =>
    columns.map((c) => {
      const val = cellValue(row[c.key], c);
      if (typeof val === "number") return { v: val, t: "n" as const };
      return { v: val, t: "s" as const };
    })
  );

  const aoa: XLSX.CellObject[][] = [header, ...body];

  const hasAmount = columns.some((c) => c.key === "amount");
  if (hasAmount && exportRows.length > 0) {
    const total = exportRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    aoa.push(
      columns.map((c, i) => {
        if (i === 0) return { v: "Total", t: "s", s: { font: { bold: true } } };
        if (c.key === "amount") return { v: total, t: "n", s: { font: { bold: true } } };
        return { v: "", t: "s" };
      })
    );
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Fit each column to its widest content (header or cell), with a soft max.
  ws["!cols"] = columns.map((col, colIdx) => {
    let maxLen = displayLen(col.label);
    for (const row of aoa) {
      const cell = row[colIdx];
      const len = displayLen(cell?.v as string | number);
      if (len > maxLen) maxLen = len;
    }
    // +2 padding; min 8, max 60 so long text doesn't blow out the sheet
    return { wch: Math.min(Math.max(maxLen + 2, 8), 60) };
  });

  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(title));
}

export function toExcelBuffer(
  result: ReportResult,
  opts: { detailed?: boolean } = {}
): Buffer {
  const detailed = Boolean(opts.detailed);
  const wb = XLSX.utils.book_new();

  if (result.sections?.length) {
    for (const section of result.sections) {
      appendSectionSheet(wb, section.title, section.columns, section.rows, detailed);
    }
  } else {
    appendSectionSheet(
      wb,
      result.title || "Report",
      result.columns ?? [],
      result.rows ?? [],
      detailed
    );
  }

  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["No data"]]), "Report");
  }

  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true }));
}
