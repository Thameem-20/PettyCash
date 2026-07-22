import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per file

export function uploadRoot(): string {
  const dir = process.env.UPLOAD_DIR || "uploads";
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

export interface SavedFile {
  storedName: string;
  originalName: string;
  mimeType: string;
  relPath: string; // relative to upload root
}

function validateReceiptUpload(file: File) {
  if (!ALLOWED.includes(file.type)) {
    throw new Error("Unsupported file type. Upload an image (JPG/PNG/WEBP) or PDF.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("File too large. Maximum size is 8 MB.");
  }
}

async function normalizeImageBuffer(
  buf: Buffer,
  mimeType: string
): Promise<{ imageBuf: Buffer; embedAs: "jpg" | "png" }> {
  let imageBuf = await sharp(buf).rotate().toBuffer();
  const meta = await sharp(imageBuf).metadata();

  // Portrait display: rotate landscape captures upright for receipt PDFs.
  if (meta.width && meta.height && meta.width > meta.height) {
    imageBuf = await sharp(imageBuf).rotate(90).toBuffer();
  }

  if (mimeType === "image/png") {
    return { imageBuf: await sharp(imageBuf).png().toBuffer(), embedAs: "png" };
  }
  return { imageBuf: await sharp(imageBuf).jpeg({ quality: 90 }).toBuffer(), embedAs: "jpg" };
}

/** Exported for payment receipt PDF generation. */
export async function normalizeImageBufferForPdf(buf: Buffer, mimeType: string) {
  return normalizeImageBuffer(buf, mimeType);
}

async function addImagePage(pdfDoc: PDFDocument, buf: Buffer, mimeType: string): Promise<void> {
  const { imageBuf, embedAs } = await normalizeImageBuffer(buf, mimeType);

  const image =
    embedAs === "png" ? await pdfDoc.embedPng(imageBuf) : await pdfDoc.embedJpg(imageBuf);
  const { width, height } = image.scale(1);
  const page = pdfDoc.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
}

/** Append a stored receipt file (PDF or image) to an existing PDF document. */
export async function appendStoredFileToPdf(
  pdfDoc: PDFDocument,
  relPath: string,
  mimeType: string | null
): Promise<void> {
  const buf = await readReceiptFile(relPath);
  if (mimeType === "application/pdf") {
    const srcDoc = await PDFDocument.load(buf);
    const pages = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices());
    pages.forEach((page) => pdfDoc.addPage(page));
    return;
  }
  if (mimeType?.startsWith("image/")) {
    await addImagePage(pdfDoc, buf, mimeType);
    return;
  }
  // Fallback: try PDF first, then image/jpeg.
  try {
    const srcDoc = await PDFDocument.load(buf);
    const pages = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices());
    pages.forEach((page) => pdfDoc.addPage(page));
  } catch {
    await addImagePage(pdfDoc, buf, "image/jpeg");
  }
}

/** Build one PDF from multiple receipt files (images as pages, PDFs merged). */
async function filesToPdf(files: File[]): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();

  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    if (file.type === "application/pdf") {
      const srcDoc = await PDFDocument.load(buf);
      const pages = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices());
      pages.forEach((page) => pdfDoc.addPage(page));
    } else {
      await addImagePage(pdfDoc, buf, file.type);
    }
  }

  return Buffer.from(await pdfDoc.save());
}

function receiptPdfName(files: File[]): string {
  if (files.length === 1) {
    const base = path.basename(files[0].name, path.extname(files[0].name)) || "receipt";
    return `${base}.pdf`;
  }
  return "receipts.pdf";
}

/** Persist receipt upload(s) as a single combined PDF. */
export async function saveReceiptFiles(files: File[]): Promise<SavedFile> {
  if (files.length === 0) {
    throw new Error("At least one receipt file is required.");
  }
  files.forEach(validateReceiptUpload);

  const buf = await filesToPdf(files);
  const storedName = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}.pdf`;
  const dir = path.join(uploadRoot(), "receipts");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, storedName), buf);

  return {
    storedName,
    originalName: receiptPdfName(files),
    mimeType: "application/pdf",
    relPath: path.join("receipts", storedName),
  };
}

/** Persist an uploaded File to disk under uploads/{folder}. */
export async function saveUploadedFile(file: File, folder: string): Promise<SavedFile> {
  if (!ALLOWED.includes(file.type)) {
    throw new Error("Unsupported file type. Upload an image (JPG/PNG/WEBP) or PDF.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("File too large. Maximum size is 8 MB.");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || mimeExt(file.type);
  const storedName = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
  const dir = path.join(uploadRoot(), folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, storedName), buf);
  return {
    storedName,
    originalName: file.name,
    mimeType: file.type,
    relPath: path.join(folder, storedName),
  };
}

export async function saveTopUpAttachment(file: File): Promise<SavedFile> {
  return saveUploadedFile(file, "topup");
}

export async function readReceiptFile(relPath: string): Promise<Buffer> {
  // Guard against path traversal.
  const safe = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, "");
  return fs.readFile(path.join(uploadRoot(), safe));
}

export async function deleteStoredFile(relPath: string): Promise<void> {
  const safe = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = path.join(uploadRoot(), safe);
  try {
    await fs.unlink(full);
  } catch {
    // File may already be gone.
  }
}

function mimeExt(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "application/pdf":
      return ".pdf";
    default:
      return "";
  }
}
