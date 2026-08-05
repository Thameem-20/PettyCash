import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";

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
  relPath: string; // relative key under upload root / blob container
}

function useAzureBlob(): boolean {
  return Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING?.trim());
}

function blobContainerName(): string {
  return process.env.AZURE_STORAGE_CONTAINER?.trim() || "pettycash-receipts";
}

/** Normalize storage keys to forward slashes (blob-friendly). */
function storageKey(relPath: string): string {
  return path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, "").replace(/\\/g, "/");
}

let cachedContainer: ContainerClient | null = null;
let containerReady: Promise<ContainerClient> | null = null;

async function getContainer(): Promise<ContainerClient> {
  if (cachedContainer) return cachedContainer;
  if (containerReady) return containerReady;

  containerReady = (async () => {
    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
    if (!conn) throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
    const service = BlobServiceClient.fromConnectionString(conn);
    const container = service.getContainerClient(blobContainerName());
    await container.createIfNotExists();
    cachedContainer = container;
    return container;
  })();

  return containerReady;
}

async function writeStoredBuffer(
  relPath: string,
  buf: Buffer,
  mimeType: string
): Promise<void> {
  const key = storageKey(relPath);
  if (useAzureBlob()) {
    const client = (await getContainer()).getBlockBlobClient(key);
    await client.uploadData(buf, {
      blobHTTPHeaders: { blobContentType: mimeType },
    });
    return;
  }
  const full = path.join(uploadRoot(), key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buf);
}

function validateReceiptUpload(file: File) {
  if (!ALLOWED.includes(file.type)) {
    throw new Error("Unsupported file type. Upload an image (JPG/PNG/WEBP) or PDF.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("File too large. Maximum size is 8 MB.");
  }
}

/** Cap only huge phone photos; smaller receipts are left untouched. */
const RECEIPT_MAX_EDGE = 3200;

async function normalizeImageBuffer(
  buf: Buffer,
  mimeType: string
): Promise<{ imageBuf: Buffer; embedAs: "jpg" | "png" }> {
  // Single sharp pipeline (auto-orient + optional portrait fix + mild max edge).
  let pipeline = sharp(buf).rotate();
  const meta = await pipeline.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  pipeline = sharp(buf).rotate();
  // Portrait display: rotate landscape captures upright for receipt PDFs.
  if (width > 0 && height > 0 && width > height) {
    pipeline = pipeline.rotate(90);
  }
  pipeline = pipeline.resize({
    width: RECEIPT_MAX_EDGE,
    height: RECEIPT_MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  });

  if (mimeType === "image/png") {
    return { imageBuf: await pipeline.png().toBuffer(), embedAs: "png" };
  }
  // High quality — receipts must stay readable; only mildly shrink huge camera shots.
  return {
    imageBuf: await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer(),
    embedAs: "jpg",
  };
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
  const relPath = storageKey(path.join("receipts", storedName));
  await writeStoredBuffer(relPath, buf, "application/pdf");

  return {
    storedName,
    originalName: receiptPdfName(files),
    mimeType: "application/pdf",
    relPath,
  };
}

/** Persist an uploaded File under {folder}/ (local disk or Azure Blob). */
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
  const relPath = storageKey(path.join(folder, storedName));
  await writeStoredBuffer(relPath, buf, file.type);
  return {
    storedName,
    originalName: file.name,
    mimeType: file.type,
    relPath,
  };
}

export async function saveTopUpAttachment(file: File): Promise<SavedFile> {
  return saveUploadedFile(file, "topup");
}

export async function readReceiptFile(relPath: string): Promise<Buffer> {
  const key = storageKey(relPath);

  if (useAzureBlob()) {
    try {
      const client = (await getContainer()).getBlockBlobClient(key);
      return await client.downloadToBuffer();
    } catch (err) {
      // Fall back to local disk for files uploaded before Azure was enabled.
      try {
        return await fs.readFile(path.join(uploadRoot(), key));
      } catch {
        throw err;
      }
    }
  }

  return fs.readFile(path.join(uploadRoot(), key));
}

export async function deleteStoredFile(relPath: string): Promise<void> {
  const key = storageKey(relPath);
  if (useAzureBlob()) {
    try {
      await (await getContainer()).getBlockBlobClient(key).deleteIfExists();
    } catch {
      // Blob may already be gone.
    }
    return;
  }
  const full = path.join(uploadRoot(), key);
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
