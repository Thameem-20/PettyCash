"use client";

export default function RefreshButton({ className = "btn-secondary" }: { className?: string }) {
  return (
    <button
      type="button"
      className={`${className} inline-flex items-center gap-1.5`}
      onClick={() => window.location.reload()}
      aria-label="Refresh page"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          className="stroke-current"
          strokeWidth="2"
          d="M4 4v6h6M20 20v-6h-6M5 19a9 9 0 0014-7 9 9 0 00-9-9"
        />
      </svg>
      Refresh
    </button>
  );
}
