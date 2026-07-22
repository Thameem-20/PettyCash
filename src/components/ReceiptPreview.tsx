"use client";

export default function ReceiptPreview({
  id,
  fileName,
  mimeType,
  compact = false,
}: {
  id: number;
  fileName: string;
  mimeType: string | null;
  compact?: boolean;
}) {
  const isPdf = mimeType === "application/pdf" || !mimeType?.startsWith("image/");
  const viewHref = `/api/files/${id}`;
  const downloadHref = `/api/files/${id}?download=1`;

  return (
    <div className="overflow-hidden border border-slate-200 bg-white">
      {isPdf ? (
        compact ? (
          <div className="flex h-28 flex-col items-center justify-center bg-slate-50 text-xs text-slate-500">
            <span className="text-sm font-semibold text-brand-700">PDF</span>
            <span className="mt-1 truncate px-2">{fileName}</span>
          </div>
        ) : (
          <iframe
            src={viewHref}
            title={fileName}
            className="block w-full min-h-[40vh] max-h-[60vh] bg-brand-50 md:min-h-[12rem] md:max-h-[20rem]"
          />
        )
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={viewHref}
          alt={fileName}
          className={
            compact
              ? "h-28 w-full object-cover"
              : "block w-full min-h-[40vh] max-h-[60vh] bg-brand-50 object-contain md:min-h-[12rem] md:max-h-[20rem]"
          }
        />
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-2 py-2">
        <a
          href={viewHref}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          View
        </a>
        <a href={downloadHref} className="btn-secondary px-2 py-1 text-xs">
          {isPdf ? "Download PDF" : "Download"}
        </a>
        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">{fileName}</span>
      </div>
    </div>
  );
}
