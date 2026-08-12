import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
  type PDFImage,
} from "pdf-lib";
import type { EnrichedRequest } from "./requests";
import { readReceiptFile, normalizeImageBufferForPdf } from "./files";
import {
  formatCashReceiverDisplay,
  isRoleSupervisorReceiver,
} from "./supervisorCashReceiverShared";
import { formatDate, formatDateOnly, money } from "./util";

export const A4_W = 595.28;
export const A4_H = 841.89;
const MARGIN = 45;

const HEADER_BG = rgb(0.86, 0.89, 0.93);
const TABLE_HEAD = rgb(0.55, 0.58, 0.62);
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.45, 0.45, 0.45);
const BORDER = rgb(0.78, 0.78, 0.78);
const WHITE = rgb(1, 1, 1);

interface StoredReceipt {
  file_url: string;
  mime_type: string | null;
  file_name: string;
}

export interface CashReceiptConfirmation {
  name: string;
  date: string;
  note?: string | null;
}

export interface AccSupReceiptApproval {
  name: string;
  date: string;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

function drawTemplateHeader(page: PDFPage, font: PDFFont, fontBold: PDFFont, branchName: string) {
  page.drawRectangle({ x: 0, y: A4_H - 72, width: A4_W, height: 72, color: HEADER_BG });
  page.drawRectangle({ x: MARGIN, y: A4_H - 58, width: 36, height: 36, color: INK });
  page.drawText("PC", {
    x: MARGIN + 8,
    y: A4_H - 46,
    size: 14,
    font: fontBold,
    color: WHITE,
  });

  const infoX = MARGIN + 52;
  page.drawText("Petty Cash Management", { x: infoX, y: A4_H - 30, size: 9, font: fontBold, color: INK });
  page.drawText(branchName, { x: infoX, y: A4_H - 42, size: 8, font, color: MUTED });

  page.drawLine({
    start: { x: MARGIN, y: A4_H - 78 },
    end: { x: A4_W - MARGIN, y: A4_H - 78 },
    thickness: 0.5,
    color: BORDER,
  });
}

function drawField(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  y: number,
  label: string,
  value: string
): number {
  page.drawText(`${label}:`, { x: MARGIN, y, size: 10, font: fontBold, color: INK });
  page.drawText(value, {
    x: MARGIN + fontBold.widthOfTextAtSize(`${label}: `, 10),
    y,
    size: 10,
    font,
    color: INK,
    maxWidth: A4_W - MARGIN * 2 - 120,
  });
  return y - 18;
}

function drawChargeTable(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  topY: number,
  lines: { description: string; jobNumber: string; amount: string }[],
  totalAmount: string
): number {
  const tableW = A4_W - MARGIN * 2;
  const colW = [tableW * 0.48, tableW * 0.28, tableW * 0.24];
  const x0 = MARGIN;
  const x1 = x0 + colW[0];
  const x2 = x1 + colW[1];
  const headerH = 26;
  const lineH = 11;
  const padY = 8;
  let y = topY;

  page.drawRectangle({ x: x0, y: y - headerH, width: tableW, height: headerH, color: TABLE_HEAD });
  page.drawText("Description", {
    x: x0 + 8,
    y: y - headerH + 8,
    size: 9,
    font: fontBold,
    color: WHITE,
  });
  page.drawText("Job Number", {
    x: x1 + 8,
    y: y - headerH + 8,
    size: 9,
    font: fontBold,
    color: WHITE,
  });
  page.drawText("Amount", {
    x: x2 + 8,
    y: y - headerH + 8,
    size: 9,
    font: fontBold,
    color: WHITE,
  });
  y -= headerH;

  for (const line of lines) {
    const descLines = wrapText(line.description, font, 9, colW[0] - 16);
    const jobParts = (line.jobNumber || "-")
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const jobLines = (jobParts.length ? jobParts : ["-"]).flatMap((j) =>
      wrapText(j, font, 8, colW[1] - 16)
    );
    const rowsNeeded = Math.max(descLines.length, jobLines.length, 1);
    const rowH = padY * 2 + rowsNeeded * lineH;

    page.drawRectangle({
      x: x0,
      y: y - rowH,
      width: tableW,
      height: rowH,
      borderColor: BORDER,
      borderWidth: 0.5,
    });
    page.drawLine({
      start: { x: x1, y },
      end: { x: x1, y: y - rowH },
      thickness: 0.5,
      color: BORDER,
    });
    page.drawLine({
      start: { x: x2, y },
      end: { x: x2, y: y - rowH },
      thickness: 0.5,
      color: BORDER,
    });

    descLines.forEach((t, i) => {
      page.drawText(t, {
        x: x0 + 8,
        y: y - padY - 8 - i * lineH,
        size: 9,
        font,
        color: INK,
      });
    });
    jobLines.forEach((t, i) => {
      page.drawText(t, {
        x: x1 + 8,
        y: y - padY - 8 - i * lineH,
        size: 8,
        font,
        color: INK,
      });
    });
    page.drawText(line.amount, {
      x: x2 + 8,
      y: y - padY - 8,
      size: 9,
      font: fontBold,
      color: INK,
    });
    y -= rowH;
  }

  const totalH = 26;
  page.drawRectangle({
    x: x0,
    y: y - totalH,
    width: tableW,
    height: totalH,
    borderColor: BORDER,
    borderWidth: 0.5,
  });
  page.drawLine({
    start: { x: x2, y },
    end: { x: x2, y: y - totalH },
    thickness: 0.5,
    color: BORDER,
  });
  page.drawText("Total Amount Disbursed", {
    x: x0 + 8,
    y: y - totalH + 9,
    size: 9,
    font: fontBold,
    color: INK,
  });
  page.drawText(totalAmount, {
    x: x2 + 8,
    y: y - totalH + 9,
    size: 9,
    font: fontBold,
    color: INK,
  });

  return y - totalH - 16;
}

function drawSignOffTable(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  topY: number,
  paidTo: string,
  paidToDate: string,
  paidBy: string,
  paidByDate: string
): number {
  const colW = (A4_W - MARGIN * 2) / 2;
  const x0 = MARGIN;
  const headerH = 26;
  const bodyH = 52;
  let y = topY;

  page.drawRectangle({ x: x0, y: y - headerH, width: colW * 2, height: headerH, color: TABLE_HEAD });
  page.drawText("Paid To", { x: x0 + 8, y: y - headerH + 8, size: 9, font: fontBold, color: WHITE });
  page.drawText("Paid By", {
    x: x0 + colW + 8,
    y: y - headerH + 8,
    size: 9,
    font: fontBold,
    color: WHITE,
  });
  y -= headerH;

  page.drawRectangle({
    x: x0,
    y: y - bodyH,
    width: colW * 2,
    height: bodyH,
    borderColor: BORDER,
    borderWidth: 0.5,
  });
  page.drawLine({
    start: { x: x0 + colW, y: y },
    end: { x: x0 + colW, y: y - bodyH },
    thickness: 0.5,
    color: BORDER,
  });

  page.drawText(paidTo, { x: x0 + 8, y: y - 18, size: 10, font: fontBold, color: INK });
  page.drawText(`Date: ${paidToDate}`, { x: x0 + 8, y: y - 34, size: 9, font, color: MUTED });
  page.drawText(paidBy, { x: x0 + colW + 8, y: y - 18, size: 10, font: fontBold, color: INK });
  page.drawText(`Date: ${paidByDate}`, { x: x0 + colW + 8, y: y - 34, size: 9, font, color: MUTED });

  return y - bodyH - 20;
}

function drawImageOnA4Page(
  page: PDFPage,
  image: PDFImage,
  topOffset: number,
  bottomOffset: number
) {
  const maxW = A4_W - MARGIN * 2;
  const maxH = A4_H - topOffset - bottomOffset - MARGIN;
  const scale = Math.min(maxW / image.width, maxH / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, {
    x: (A4_W - w) / 2,
    y: bottomOffset + (maxH - h) / 2,
    width: w,
    height: h,
  });
}

async function appendMessengerReceiptsA4(
  pdfDoc: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  receipts: StoredReceipt[]
) {
  for (const rc of receipts) {
    const buf = await readReceiptFile(rc.file_url);
    const mime = rc.mime_type || "application/pdf";

    if (mime === "application/pdf") {
      let srcDoc: PDFDocument;
      try {
        srcDoc = await PDFDocument.load(buf);
      } catch {
        continue;
      }
      for (const srcPage of srcDoc.getPages()) {
        const embedded = await pdfDoc.embedPage(srcPage);
        const { width, height } = srcPage.getSize();
        const page = pdfDoc.addPage([A4_W, A4_H]);
        drawTemplateHeader(page, font, fontBold, "Supporting Document");
        page.drawText("Supporting Receipt", {
          x: MARGIN,
          y: A4_H - 100,
          size: 14,
          font: fontBold,
          color: INK,
        });
        const topOffset = 112;
        const bottomOffset = 36;
        const maxW = A4_W - MARGIN * 2;
        const maxH = A4_H - topOffset - bottomOffset;
        const scale = Math.min(maxW / width, maxH / height);
        const w = width * scale;
        const h = height * scale;
        page.drawPage(embedded, {
          x: (A4_W - w) / 2,
          y: bottomOffset + (maxH - h) / 2,
          width: w,
          height: h,
        });
      }
      continue;
    }

    if (mime.startsWith("image/")) {
      const { imageBuf, embedAs } = await normalizeImageBufferForPdf(buf, mime);
      const image =
        embedAs === "png" ? await pdfDoc.embedPng(imageBuf) : await pdfDoc.embedJpg(imageBuf);
      const page = pdfDoc.addPage([A4_W, A4_H]);
      drawTemplateHeader(page, font, fontBold, "Supporting Document");
      page.drawText("Supporting Receipt", {
        x: MARGIN,
        y: A4_H - 100,
        size: 14,
        font: fontBold,
        color: INK,
      });
      drawImageOnA4Page(page, image, 112, 36);
    }
  }
}

/** Merge one or more stored receipt files (images/PDFs) into a single A4 PDF. */
export async function generateCombinedReceiptsPdf(receipts: StoredReceipt[]): Promise<Buffer> {
  if (!receipts.length) {
    throw new Error("No receipts to combine");
  }
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  await appendMessengerReceiptsA4(pdfDoc, font, fontBold, receipts);
  if (pdfDoc.getPageCount() === 0) {
    throw new Error("Could not embed any receipt files");
  }
  return Buffer.from(await pdfDoc.save());
}

export async function generatePettyCashPaymentReceiptPdf(
  request: EnrichedRequest,
  jobNumbers: string[],
  messengerReceipts: StoredReceipt[],
  cashConfirmed: CashReceiptConfirmation | null,
  charges: { description: string; amount: number; job_number?: string | null }[] = [],
  accSupApproved: AccSupReceiptApproval | null = null
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([A4_W, A4_H]);
  drawTemplateHeader(page, font, fontBold, request.branch_name);

  const title = "Petty Cash Receipt";
  const titleW = fontBold.widthOfTextAtSize(title, 18);
  page.drawText(title, {
    x: (A4_W - titleW) / 2,
    y: A4_H - 108,
    size: 18,
    font: fontBold,
    color: INK,
  });

  const requestTypeLabel =
    request.request_type === "exact" ? "Exact Payment" : "Suspense Advance";
  const subtitle =
    charges.length > 1
      ? `${requestTypeLabel} · ${charges.length} charges`
      : `${requestTypeLabel} · ${request.category_name}`;
  const subtitleW = font.widthOfTextAtSize(subtitle, 10);
  page.drawText(subtitle, {
    x: (A4_W - subtitleW) / 2,
    y: A4_H - 124,
    size: 10,
    font,
    color: MUTED,
  });

  const paidTo = isRoleSupervisorReceiver(request.cash_receiver_label)
    ? formatCashReceiverDisplay(request.receiver_name, request.cash_receiver_label)
    : request.receiver_name || request.cash_receiver_label || request.submitted_by_name;
  const paidBy = request.processing_by_name || "Accounts";
  const paidAmount = money(request.paid_amount, request.currency);
  const paidDate = formatDateOnly(request.paid_at);
  const fallbackJob =
    jobNumbers.length > 0 ? jobNumbers.join("\n") : request.job_number?.trim() || "-";

  const chargeLines =
    charges.length > 0
      ? charges.map((c, i) => ({
          description: charges.length > 1 ? `${i + 1}. ${c.description}` : c.description,
          jobNumber: c.job_number?.trim() || (charges.length === 1 ? fallbackJob : "-"),
          amount: money(c.amount, request.currency),
        }))
      : [
          {
            description: request.description?.trim() || request.category_name,
            jobNumber: fallbackJob,
            amount: paidAmount,
          },
        ];

  let y = A4_H - 148;
  y = drawField(page, font, fontBold, y, "Request Number", request.request_no);
  y = drawField(page, font, fontBold, y, "Status", request.status);
  y = drawField(page, font, fontBold, y, "Charge Type", request.charge_type === "job" ? "Job Related" : "Non Job Related");
  y = drawField(page, font, fontBold, y, "Branch", request.branch_name + (request.branch_override ? " (override)" : ""));
  y = drawField(page, font, fontBold, y, "Submitted By", request.submitted_by_name);
  y = drawField(page, font, fontBold, y, "Submitted On", formatDate(request.created_at));
  y = drawField(page, font, fontBold, y, "Requested Amount", money(request.requested_amount, request.currency));
  if (request.approved_amount != null) {
    y = drawField(page, font, fontBold, y, "Approved Amount", money(request.approved_amount, request.currency));
  }
  y = drawField(page, font, fontBold, y, "Paid Amount", paidAmount);

  // Suspense settlement figures — advance is only complete with expense/returns.
  if (request.request_type === "suspense") {
    const paid = Number(request.paid_amount || 0);
    const expense = Number(request.actual_expense_amount || 0);
    const returned = Number(request.returned_amount || 0);
    const additional = Number(request.additional_paid_amount || 0);

    if (request.actual_expense_amount != null) {
      y = drawField(
        page,
        font,
        fontBold,
        y,
        "Actual Expense",
        money(request.actual_expense_amount, request.currency)
      );
    }
    y = drawField(page, font, fontBold, y, "Returned Amount", money(returned, request.currency));
    if (additional > 0) {
      y = drawField(
        page,
        font,
        fontBold,
        y,
        "Additional Paid",
        money(additional, request.currency)
      );
    }
    const outstanding = Math.max(0, Math.round((paid + additional - returned - expense) * 100) / 100);
    y = drawField(page, font, fontBold, y, "Outstanding", money(outstanding, request.currency));
  }

  y = drawField(page, font, fontBold, y, "Paid By", paidBy);
  if (accSupApproved) {
    y = drawField(
      page,
      font,
      fontBold,
      y,
      "Approved By",
      `${accSupApproved.name} (${formatDate(accSupApproved.date)})`
    );
  }
  y = drawField(
    page,
    font,
    fontBold,
    y,
    "Zybo PCV",
    request.zybo_voucher_code?.trim() || "Pending"
  );

  y -= 6;
  y = drawChargeTable(page, font, fontBold, y, chargeLines, paidAmount);

  y = drawSignOffTable(
    page,
    font,
    fontBold,
    y,
    paidTo,
    cashConfirmed ? formatDateOnly(cashConfirmed.date) : paidDate,
    paidBy,
    paidDate
  );

  if (cashConfirmed) {
    y = drawField(
      page,
      font,
      fontBold,
      y,
      "Cash Received Confirmed By",
      `${cashConfirmed.name} (${formatDate(cashConfirmed.date)})`
    );
    if (cashConfirmed.note?.trim()) {
      page.drawText("Note:", { x: MARGIN, y, size: 10, font: fontBold, color: INK });
      y -= 14;
      const noteLines = wrapText(cashConfirmed.note.trim(), font, 10, A4_W - MARGIN * 2);
      for (const line of noteLines) {
        page.drawText(line, { x: MARGIN, y, size: 10, font, color: INK });
        y -= 14;
      }
      y -= 4;
    }
  }

  page.drawText(
    "This is an official petty cash payment record generated by the Petty Cash Management System.",
    { x: MARGIN, y: 48, size: 8, font, color: MUTED, maxWidth: A4_W - MARGIN * 2 }
  );

  if (messengerReceipts.length > 0) {
    await appendMessengerReceiptsA4(pdfDoc, font, fontBold, messengerReceipts);
  }

  return Buffer.from(await pdfDoc.save());
}
