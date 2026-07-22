"use client";

import { useRouter } from "next/navigation";

export default function ClickableTableRow({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <tr
      className="cursor-pointer hover:bg-brand-50"
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      tabIndex={0}
      role="link"
      aria-label={`Open request ${href}`}
    >
      {children}
    </tr>
  );
}
