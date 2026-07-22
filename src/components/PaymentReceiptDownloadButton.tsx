"use client";

export default function PaymentReceiptDownloadButton({ requestId }: { requestId: number }) {
  return (
    <a
      href={`/api/requests/${requestId}/payment-receipt`}
      className="btn-secondary whitespace-nowrap px-2 py-1 text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      Download Petty Cash Receipt
    </a>
  );
}
