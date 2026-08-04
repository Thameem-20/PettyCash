import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import { formatDateOnly, money } from "./util";

const PAGE_W = 841.89; // A4 landscape
const PAGE_H = 595.28;
const MARGIN = 32;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP = PAGE_H - 58;
const BOTTOM = 40;

const INK = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.42, 0.45, 0.5);
const WHITE = rgb(1, 1, 1);
const BRAND = rgb(0.02, 0.59, 0.41);
const BRAND_SOFT = rgb(0.92, 0.98, 0.95);
const HEADER_BG = rgb(0.96, 0.97, 0.98);
const ROW_ALT = rgb(0.985, 0.988, 0.992);
const BORDER = rgb(0.86, 0.88, 0.9);
const TABLE_HEAD = rgb(0.15, 0.17, 0.22);
const DANGER = rgb(0.75, 0.2, 0.25);
const WARN = rgb(0.7, 0.45, 0.05);

export type LedgerPdfPcrRow = {
  paidDate: string;
  branch?: string;
  type: string;
  requestNo: string;
  jobNumber: string;
  truck?: string;
  trailer?: string;
  driver?: string;
  requestedBy: string;
  paidTo: string;
  zybo: string;
  pcp?: string;
  jv?: string;
  by: string;
  paidOut: number;
};

export type LedgerPdfOsrRow = {
  paidDate: string;
  branch?: string;
  requestNo: string;
  jobNumber: string;
  truck?: string;
  trailer?: string;
  driver?: string;
  requestedBy: string;
  paidTo: string;
  zybo: string;
  pcp?: string;
  jv?: string;
  by: string;
  outstanding: number;
};

export type LedgerPdfInput = {
  branchName: string;
  dayLabel: string;
  showBranch: boolean;
  compassionMode?: boolean;
  openingBalance: number;
  openingBalanceAsPerZybo: number;
  paidOut: number;
  paidLabel: string;
  totalSuspensePaid: number;
  closingBalance: number;
  balanceAsPerZybo: number;
  pcrRows: LedgerPdfPcrRow[];
  pcrTotalPaid: number;
  pcrTotalLabel: string;
  osrRows: LedgerPdfOsrRow[];
  osrTotalOutstanding: number;
};

type Col = { label: string; width: number; align?: "left" | "right" };

function truncate(font: PDFFont, text: string, size: number, maxWidth: number): string {
  const t = (text || "-").replace(/\s+/g, " ").trim() || "-";
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  let out = t;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function drawHeader(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  branchName: string,
  dayLabel: string
) {
  page.drawRectangle({ x: 0, y: PAGE_H - 6, width: PAGE_W, height: 6, color: BRAND });
  page.drawRectangle({ x: MARGIN, y: PAGE_H - 42, width: 26, height: 26, color: BRAND });
  page.drawText("PC", {
    x: MARGIN + 5,
    y: PAGE_H - 33,
    size: 10,
    font: fontBold,
    color: WHITE,
  });
  page.drawText("Petty Cash Ledger", {
    x: MARGIN + 36,
    y: PAGE_H - 26,
    size: 13,
    font: fontBold,
    color: INK,
  });
  page.drawText(`${branchName}  ·  ${dayLabel}`, {
    x: MARGIN + 36,
    y: PAGE_H - 40,
    size: 8.5,
    font,
    color: MUTED,
  });
  page.drawLine({
    start: { x: MARGIN, y: PAGE_H - 50 },
    end: { x: PAGE_W - MARGIN, y: PAGE_H - 50 },
    thickness: 0.7,
    color: BORDER,
  });
}

function drawFooter(page: PDFPage, font: PDFFont, pageNo: number, pageCount: number) {
  page.drawLine({
    start: { x: MARGIN, y: 26 },
    end: { x: PAGE_W - MARGIN, y: 26 },
    thickness: 0.6,
    color: BORDER,
  });
  page.drawText("Petty Cash Management", {
    x: MARGIN,
    y: 14,
    size: 7,
    font,
    color: MUTED,
  });
  const pageLabel = `Page ${pageNo} of ${pageCount}`;
  page.drawText(pageLabel, {
    x: PAGE_W - MARGIN - font.widthOfTextAtSize(pageLabel, 7),
    y: 14,
    size: 7,
    font,
    color: MUTED,
  });
}

function drawSummaryCards(
  page: PDFPage,
  fontBold: PDFFont,
  y: number,
  cards: {
    label: string;
    value: string;
    stacked?: { label: string; value: string }[];
    accent: ReturnType<typeof rgb>;
  }[]
): number {
  const gap = 8;
  const cols = Math.min(cards.length, 3);
  const rows = Math.ceil(cards.length / cols);
  const cardW = (CONTENT_W - gap * (cols - 1)) / cols;
  const maxLines = Math.max(
    1,
    ...cards.map((c) => (c.stacked && c.stacked.length > 0 ? c.stacked.length : 1))
  );
  const cardH = 16 + maxLines * 12;
  const rowGap = 8;

  cards.forEach((card, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = MARGIN + col * (cardW + gap);
    const top = y - row * (cardH + rowGap);
    page.drawRectangle({
      x,
      y: top - cardH,
      width: cardW,
      height: cardH,
      color: WHITE,
      borderColor: BORDER,
      borderWidth: 0.9,
    });
    page.drawRectangle({
      x,
      y: top - 3,
      width: cardW,
      height: 3,
      color: card.accent,
    });
    page.drawText(card.label.toUpperCase(), {
      x: x + 8,
      y: top - 12,
      size: 5.5,
      font: fontBold,
      color: MUTED,
    });
    if (card.stacked && card.stacked.length > 0) {
      card.stacked.forEach((line, li) => {
        const ly = top - 26 - li * 12;
        page.drawText(line.label, {
          x: x + 8,
          y: ly,
          size: 6,
          font: fontBold,
          color: MUTED,
        });
        const val = truncate(fontBold, line.value, 8.5, cardW - 78);
        const vw = fontBold.widthOfTextAtSize(val, 8.5);
        page.drawText(val, {
          x: x + cardW - 8 - vw,
          y: ly,
          size: 8.5,
          font: fontBold,
          color: INK,
        });
      });
    } else {
      page.drawText(card.value, {
        x: x + 8,
        y: top - 30,
        size: 10,
        font: fontBold,
        color: INK,
      });
    }
  });

  return y - rows * cardH - (rows - 1) * rowGap - 16;
}

function drawSectionTitle(
  page: PDFPage,
  fontBold: PDFFont,
  y: number,
  title: string,
  count: number
): number {
  page.drawRectangle({ x: MARGIN, y: y - 1, width: 3, height: 11, color: BRAND });
  page.drawText(title, {
    x: MARGIN + 10,
    y,
    size: 10,
    font: fontBold,
    color: INK,
  });
  const badge = `(${count})`;
  page.drawText(badge, {
    x: MARGIN + 12 + fontBold.widthOfTextAtSize(title, 10),
    y,
    size: 9,
    font: fontBold,
    color: MUTED,
  });
  return y - 16;
}

function drawTableHeader(page: PDFPage, fontBold: PDFFont, y: number, cols: Col[]): number {
  const h = 18;
  page.drawRectangle({
    x: MARGIN,
    y: y - h + 4,
    width: CONTENT_W,
    height: h,
    color: TABLE_HEAD,
  });
  let x = MARGIN + 8;
  for (const col of cols) {
    const label = col.label.toUpperCase();
    const tw = fontBold.widthOfTextAtSize(label, 6.5);
    const tx = col.align === "right" ? x + col.width - tw - 6 : x;
    page.drawText(label, { x: tx, y: y - 8, size: 6.5, font: fontBold, color: WHITE });
    x += col.width;
  }
  return y - h - 1;
}

function drawDataRow(
  page: PDFPage,
  font: PDFFont,
  y: number,
  cols: Col[],
  values: string[],
  alt: boolean,
  amountColor: ReturnType<typeof rgb>
): number {
  const lineH = 10;
  const padY = 5;
  const cellLines = values.map((v) => {
    const raw = (v || "-").trim() || "-";
    const parts = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : ["-"];
  });
  const lineCount = Math.max(1, ...cellLines.map((lines) => lines.length));
  const h = padY * 2 + lineCount * lineH;

  page.drawRectangle({
    x: MARGIN,
    y: y - h + 4,
    width: CONTENT_W,
    height: h,
    color: alt ? ROW_ALT : WHITE,
  });
  page.drawLine({
    start: { x: MARGIN, y: y - h + 4 },
    end: { x: MARGIN + CONTENT_W, y: y - h + 4 },
    thickness: 0.45,
    color: BORDER,
  });

  let x = MARGIN + 8;
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    const isAmount = col.align === "right";
    const lines = cellLines[i] || ["-"];
    lines.forEach((line, li) => {
      const text = truncate(font, line, 8, col.width - 10);
      const tw = font.widthOfTextAtSize(text, 8);
      const tx = isAmount ? x + col.width - tw - 6 : x;
      page.drawText(text, {
        x: tx,
        y: y - padY - 6 - li * lineH,
        size: 8,
        font,
        color: isAmount ? amountColor : INK,
      });
    });
    x += col.width;
  }
  return y - h;
}

function drawTotalBar(
  page: PDFPage,
  fontBold: PDFFont,
  y: number,
  label: string,
  value: string,
  valueColor: ReturnType<typeof rgb>
): number {
  const h = 24;
  page.drawRectangle({
    x: MARGIN,
    y: y - h,
    width: CONTENT_W,
    height: h,
    color: BRAND_SOFT,
    borderColor: BORDER,
    borderWidth: 0.7,
  });
  page.drawText(label, {
    x: MARGIN + 12,
    y: y - 15,
    size: 9,
    font: fontBold,
    color: INK,
  });
  const vw = fontBold.widthOfTextAtSize(value, 10);
  page.drawText(value, {
    x: MARGIN + CONTENT_W - vw - 12,
    y: y - 15,
    size: 10,
    font: fontBold,
    color: valueColor,
  });
  return y - h - 18;
}

function drawEmpty(page: PDFPage, font: PDFFont, y: number, message: string): number {
  page.drawText(message, {
    x: MARGIN + 8,
    y: y - 4,
    size: 8,
    font,
    color: MUTED,
  });
  return y - 18;
}

function scaleCols(cols: Col[]): Col[] {
  const total = cols.reduce((s, c) => s + c.width, 0);
  const scale = (CONTENT_W - 16) / total;
  return cols.map((c) => ({ ...c, width: Math.floor(c.width * scale) }));
}

export async function generateLedgerPdf(data: LedgerPdfInput): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  type Cur = { page: PDFPage; y: number };
  const pages: PDFPage[] = [];

  function newPage(): Cur {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    drawHeader(page, font, fontBold, data.branchName, data.dayLabel);
    return { page, y: TOP };
  }

  function need(cur: Cur, space: number): Cur {
    if (cur.y - space >= BOTTOM) return cur;
    return newPage();
  }

  let cur = newPage();

  cur.y = drawSummaryCards(cur.page, fontBold, cur.y, [
    {
      label: "Cash In-hand",
      value: money(data.openingBalance),
      stacked: [
        { label: "Opening cash in hand", value: money(data.openingBalance) },
        { label: data.paidLabel, value: money(data.paidOut) },
        { label: "Closing cash in hand", value: money(data.closingBalance) },
      ],
      accent: BRAND,
    },
    {
      label: "Cash + Suspense",
      value: money(data.openingBalanceAsPerZybo),
      stacked: [
        { label: "Opening Zybo balance", value: money(data.openingBalanceAsPerZybo) },
        { label: "Total suspense paid", value: money(data.osrTotalOutstanding) },
        { label: "Petty cash paid", value: money(data.pcrTotalPaid) },
        { label: "Closing cash in hand", value: money(data.closingBalance) },
      ],
      accent: WARN,
    },
    {
      label: "As per Zybo",
      value: money(data.balanceAsPerZybo),
      stacked: [
        { label: "Opening Zybo balance", value: money(data.openingBalanceAsPerZybo) },
        { label: "Petty cash paid", value: money(data.pcrTotalPaid) },
        { label: "Closing Zybo balance", value: money(data.balanceAsPerZybo) },
      ],
      accent: MUTED,
    },
  ]);

  const compassion = Boolean(data.compassionMode);
  const pcrCols = scaleCols([
    { label: "Paid Date", width: 70 },
    ...(data.showBranch ? [{ label: "Branch", width: 80 }] : []),
    { label: "Request", width: 85 },
    ...(compassion
      ? [
          { label: "Truck", width: 70 },
          { label: "Trailer", width: 70 },
          { label: "Driver", width: 90 },
        ]
      : [{ label: "Job No", width: 110 }]),
    { label: "Requested By", width: 90 },
    { label: "Paid To", width: 90 },
    { label: "Paid By", width: 70 },
    ...(compassion
      ? [
          { label: "PCP", width: 70 },
          { label: "JV", width: 70 },
        ]
      : [{ label: "Zybo PCV", width: 85 }]),
    { label: "Paid Out", width: 75, align: "right" as const },
  ]);

  cur = need(cur, 40);
  cur.y = drawSectionTitle(cur.page, fontBold, cur.y, "PCR — Petty Cash Paid", data.pcrRows.length);
  cur.y = drawTableHeader(cur.page, fontBold, cur.y, pcrCols);

  if (data.pcrRows.length === 0) {
    cur.y = drawEmpty(cur.page, font, cur.y, "No PCR / CSR movements for this day.");
  } else {
    data.pcrRows.forEach((row, i) => {
      const midLines = compassion
        ? 1
        : Math.max(1, splitJobs(row.jobNumber).length);
      cur = need(cur, 12 + midLines * 10);
      if (cur.y > TOP - 5) {
        // Fresh page mid-table — repeat header
        cur.y = drawSectionTitle(
          cur.page,
          fontBold,
          cur.y,
          "PCR — Petty Cash Paid (continued)",
          data.pcrRows.length
        );
        cur.y = drawTableHeader(cur.page, fontBold, cur.y, pcrCols);
      }
      const vals = [
        row.paidDate,
        ...(data.showBranch ? [row.branch || "-"] : []),
        row.requestNo,
        ...(compassion
          ? [row.truck || "-", row.trailer || "-", row.driver || "-"]
          : [splitJobs(row.jobNumber).join("\n")]),
        row.requestedBy,
        row.paidTo,
        row.by,
        ...(compassion ? [row.pcp || "-", row.jv || "-"] : [row.zybo]),
        money(row.paidOut),
      ];
      cur.y = drawDataRow(cur.page, font, cur.y, pcrCols, vals, i % 2 === 1, DANGER);
    });
  }

  cur = need(cur, 44);
  cur.y = drawTotalBar(
    cur.page,
    fontBold,
    cur.y,
    data.pcrTotalLabel,
    money(data.pcrTotalPaid),
    DANGER
  );

  const osrCols = scaleCols([
    { label: "Paid Date", width: 70 },
    ...(data.showBranch ? [{ label: "Branch", width: 80 }] : []),
    { label: "Request", width: 90 },
    ...(compassion
      ? [
          { label: "Truck", width: 70 },
          { label: "Trailer", width: 70 },
          { label: "Driver", width: 90 },
        ]
      : [{ label: "Job No", width: 120 }]),
    { label: "Requested By", width: 95 },
    { label: "Paid To", width: 95 },
    { label: "Paid By", width: 70 },
    ...(compassion
      ? [
          { label: "PCP", width: 70 },
          { label: "JV", width: 70 },
        ]
      : [{ label: "Zybo PCV", width: 90 }]),
    { label: "Outstanding", width: 80, align: "right" as const },
  ]);

  cur = need(cur, 50);
  cur.y = drawSectionTitle(cur.page, fontBold, cur.y, "OSR — Open Suspense", data.osrRows.length);
  cur.y = drawTableHeader(cur.page, fontBold, cur.y, osrCols);

  if (data.osrRows.length === 0) {
    cur.y = drawEmpty(cur.page, font, cur.y, "No active open suspense.");
  } else {
    data.osrRows.forEach((row, i) => {
      const midLines = compassion
        ? 1
        : Math.max(1, splitJobs(row.jobNumber).length);
      cur = need(cur, 12 + midLines * 10);
      if (cur.y > TOP - 5) {
        cur.y = drawSectionTitle(
          cur.page,
          fontBold,
          cur.y,
          "OSR — Open Suspense (continued)",
          data.osrRows.length
        );
        cur.y = drawTableHeader(cur.page, fontBold, cur.y, osrCols);
      }
      const vals = [
        row.paidDate,
        ...(data.showBranch ? [row.branch || "-"] : []),
        row.requestNo,
        ...(compassion
          ? [row.truck || "-", row.trailer || "-", row.driver || "-"]
          : [splitJobs(row.jobNumber).join("\n")]),
        row.requestedBy,
        row.paidTo,
        row.by,
        ...(compassion ? [row.pcp || "-", row.jv || "-"] : [row.zybo]),
        money(row.outstanding),
      ];
      cur.y = drawDataRow(cur.page, font, cur.y, osrCols, vals, i % 2 === 1, WARN);
    });
  }

  cur = need(cur, 44);
  cur.y = drawTotalBar(
    cur.page,
    fontBold,
    cur.y,
    "Total outstanding",
    money(data.osrTotalOutstanding),
    WARN
  );

  pages.forEach((page, i) => drawFooter(page, font, i + 1, pages.length));

  return Buffer.from(await pdfDoc.save());
}

export function splitJobs(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatJobsForPdf(value: string | null | undefined): string {
  const jobs = splitJobs(value);
  return jobs.length ? jobs.join("\n") : "-";
}

export { formatDateOnly };
