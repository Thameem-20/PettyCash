"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { EnrichedRequest } from "@/lib/requests";
import { money } from "@/lib/util";
import { EXACT_STATUS, SUSPENSE_STATUS } from "@/lib/status";

type PaymentMode = "pay" | "issue" | "settle";

type PaymentAmountContextValue = {
  amount: string;
  setAmount: (value: string) => void;
  mode: PaymentMode | null;
};

const PaymentAmountContext = createContext<PaymentAmountContextValue | null>(null);

export function usePaymentAmountContext() {
  return useContext(PaymentAmountContext);
}

function resolvePaymentMode(request: EnrichedRequest): PaymentMode | null {
  const s = request.status;
  if (request.request_type === "exact" && (s === EXACT_STATUS.PENDING_PAYMENT || s === EXACT_STATUS.PENDING_ACCOUNTS_REVIEW)) {
    return "pay";
  }
  if (request.request_type === "suspense" && s === SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE) {
    return "issue";
  }
  if (
    request.request_type === "suspense" &&
    (s === SUSPENSE_STATUS.RECEIPT_SUBMITTED || s === SUSPENSE_STATUS.PENDING_SETTLEMENT_REVIEW)
  ) {
    return "settle";
  }
  return null;
}

export function AccountsRequestBalanceBar({
  branchName,
  cashInHand,
  afterBalance,
  currency,
  mode,
  paymentDelta,
}: {
  branchName: string;
  cashInHand: number;
  afterBalance: number;
  currency: string;
  mode: PaymentMode | null;
  paymentDelta: number;
}) {
  const insufficient = afterBalance < 0;
  const changeLabel =
    mode === "settle"
      ? paymentDelta > 0
        ? "Cash returned to branch"
        : paymentDelta < 0
          ? "Additional cash out"
          : "No cash movement"
      : "Payment amount";

  return (
    <div
      className={`mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 border px-3 py-2 text-sm ${
        insufficient
          ? "border-rose-200 bg-rose-50/50"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-slate-500">Available</span>
        <span className="font-semibold text-sky-800">{money(cashInHand, currency)}</span>
        <span className="hidden text-xs text-slate-400 sm:inline">({branchName})</span>
      </div>
      <span className="hidden text-slate-300 sm:inline" aria-hidden>
        |
      </span>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-xs text-slate-500">After processing</span>
        <span className={`font-semibold ${insufficient ? "text-rose-700" : "text-emerald-700"}`}>
          {money(afterBalance, currency)}
        </span>
        <span className={`text-xs ${insufficient ? "text-rose-600" : "text-slate-500"}`}>
          ({changeLabel}: {money(Math.abs(paymentDelta), currency)}
          {insufficient && " · insufficient"})
        </span>
      </div>
    </div>
  );
}

export function AccountsPaymentProvider({
  request,
  cashInHand,
  children,
}: {
  request: EnrichedRequest;
  cashInHand: number;
  children: React.ReactNode;
}) {
  const mode = resolvePaymentMode(request);
  const defaultAmount = String(request.approved_amount ?? request.requested_amount ?? "");
  const [amount, setAmount] = useState(mode === "settle" ? "" : defaultAmount);

  const { afterBalance, paymentDelta } = useMemo(() => {
    if (mode === "settle") {
      const advance = Number(request.paid_amount || 0);
      const actual = Number(amount || 0);
      if (!amount.trim()) {
        return { afterBalance: cashInHand, paymentDelta: 0 };
      }
      const diff = advance - actual;
      return { afterBalance: cashInHand + diff, paymentDelta: diff };
    }
    const paid = Number(amount || 0);
    return { afterBalance: cashInHand - paid, paymentDelta: -paid };
  }, [amount, cashInHand, mode, request.paid_amount]);

  return (
    <PaymentAmountContext.Provider value={{ amount, setAmount, mode }}>
      <AccountsRequestBalanceBar
        branchName={request.branch_name}
        cashInHand={cashInHand}
        afterBalance={afterBalance}
        currency={request.currency}
        mode={mode}
        paymentDelta={paymentDelta}
      />
      {children}
    </PaymentAmountContext.Provider>
  );
}
