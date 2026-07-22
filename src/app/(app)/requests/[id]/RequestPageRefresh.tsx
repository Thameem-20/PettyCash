"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refetch server data on mount so action buttons reflect the latest status. */
export default function RequestPageRefresh() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
