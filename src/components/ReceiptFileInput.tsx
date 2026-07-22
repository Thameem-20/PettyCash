"use client";

import { useEffect, useMemo, useRef } from "react";

function isImage(file: File) {
  return file.type.startsWith("image/");
}

export default function ReceiptFileInput({
  files,
  onChange,
  label,
  hint = "JPG, PNG, WEBP or PDF, up to 8 MB each. Select again to add more files.",
  multiple = true,
  capture,
  id = "receipt-upload",
  compact = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  label?: React.ReactNode;
  hint?: string;
  multiple?: boolean;
  capture?: boolean | "environment" | "user";
  id?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const previewUrls = useMemo(
    () => files.map((f) => (isImage(f) ? URL.createObjectURL(f) : null)),
    [files]
  );

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [previewUrls]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files;
    if (!picked?.length) return;
    const incoming = Array.from(picked);
    onChange(multiple ? [...files, ...incoming] : incoming);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(index: number) {
    const next = files.filter((_, i) => i !== index);
    onChange(next);
    if (next.length === 0 && inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      {label ? (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <input
        ref={inputRef}
        id={id}
        className="input"
        type="file"
        accept="image/*,application/pdf"
        multiple={multiple}
        capture={capture}
        onChange={handleChange}
      />
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
      {files.length > 0 && multiple ? (
        <button
          type="button"
          className="mt-2 text-xs font-medium text-brand-700 hover:underline"
          onClick={() => inputRef.current?.click()}
        >
          + Add another receipt
        </button>
      ) : null}
      {files.length > 0 ? (
        compact ? (
          <ul className="mt-2 space-y-1.5">
            {files.map((file, i) => (
              <li
                key={`${file.name}-${file.lastModified}-${i}`}
                className="flex items-center gap-2 border border-slate-200 bg-white px-2 py-1.5"
              >
                {previewUrls[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrls[i]!}
                    alt=""
                    className="h-10 w-10 shrink-0 object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-brand-50 text-[10px] font-semibold text-brand-700">
                    PDF
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="shrink-0 px-1.5 text-sm text-rose-600 hover:underline"
                  aria-label={`Remove ${file.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="-mx-4 mt-4 space-y-4">
            {files.map((file, i) => (
              <div
                key={`${file.name}-${file.lastModified}-${i}`}
                className="relative w-full overflow-hidden border-y border-brand-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center border border-white/30 bg-black/55 text-white transition hover:bg-black/75"
                  aria-label={`Remove ${file.name}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M18 6L6 18M6 6l12 12"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                {previewUrls[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrls[i]!}
                    alt={file.name}
                    className="block w-full min-h-[50vh] max-h-[70vh] bg-brand-50 object-contain md:min-h-[16rem] md:max-h-[24rem]"
                  />
                ) : (
                  <div className="flex min-h-[36vh] flex-col items-center justify-center bg-brand-50 px-4 py-8 text-center text-sm text-slate-500 md:min-h-[12rem]">
                    <span className="text-base font-semibold text-brand-700">PDF</span>
                    <span className="mt-2 line-clamp-3 w-full break-all">{file.name}</span>
                  </div>
                )}
                <p className="truncate border-t border-brand-200 px-4 py-2 text-sm text-slate-600">
                  {file.name}
                </p>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
