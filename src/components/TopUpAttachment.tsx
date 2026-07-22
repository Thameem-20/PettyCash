export default function TopUpAttachment({
  topUpId,
  mime,
  name,
}: {
  topUpId: number;
  mime: string | null;
  name: string | null;
}) {
  const href = `/api/topup/${topUpId}/attachment`;

  return (
    <div className="mt-3 border border-brand-200 bg-brand-50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">Supporting Document</p>
      {mime?.startsWith("image/") ? (
        <a href={href} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={name || "Top-up attachment"}
            className="max-h-56 w-full max-w-lg border border-brand-200 bg-white object-contain"
          />
        </a>
      ) : (
        <a href={href} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-700 hover:underline">
          View attachment{name ? `: ${name}` : ""}
        </a>
      )}
    </div>
  );
}
