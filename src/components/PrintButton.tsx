"use client";

export default function PrintButton() {
  return (
    <button className="btn-secondary no-print" onClick={() => window.print()}>
      Print / PDF
    </button>
  );
}
