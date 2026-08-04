import { NextRequest, NextResponse } from "next/server";
import { fail, requireApiSession } from "@/lib/api";
import { query, queryOne } from "@/lib/db";
import { accountsBranchIds } from "@/lib/requests";
import {
  resolveBranchScope,
  branchScopeLabel,
  scopeIdsFrom,
  allowAllBranchesForRole,
} from "@/lib/accountsBranch";
import { resolveActiveBranchParam } from "@/lib/preferredBranch";
import { getBranchProfile, isCompassionMode } from "@/lib/branchProfile";
import {
  getDailyLedgerSummary,
  normalizeLedgerDate,
  ledgerEntryGroup,
  ledgerDisplayRequestNo,
  LEDGER_LABELS,
  type LedgerTxnType,
} from "@/lib/ledger";
import { formatDateOnly } from "@/lib/util";
import {
  generateLedgerPdf,
  formatJobsForPdf,
  type LedgerPdfPcrRow,
  type LedgerPdfOsrRow,
} from "@/lib/ledgerPdf";

export const dynamic = "force-dynamic";

function ledgerTypeLabel(type: string): string {
  const short: Partial<Record<LedgerTxnType, string>> = {
    exact_paid: "Exact paid",
    suspense_issued: "Issued",
    suspense_returned: "Returned",
    additional_paid: "Addl. paid",
    topup_received: "Top-up",
    adjustment: "Adjust",
  };
  return short[type as LedgerTxnType] || LEDGER_LABELS[type as LedgerTxnType] || type.replace(/_/g, " ");
}

function addDaysYmd(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolveLedgerDay(periodParam: string | null, dateParam: string | null, today: string) {
  if (periodParam === "yesterday") return { date: addDaysYmd(today, -1) };
  if (periodParam === "custom") {
    const custom = normalizeLedgerDate(dateParam) || today;
    return { date: custom > today ? today : custom };
  }
  return { date: today };
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireApiSession(["accounts", "accounts_supervisor", "admin"]);
    const sp = req.nextUrl.searchParams;

    let branchList: { id: number; branch_name: string; branch_code: string }[];
    if (session.role === "accounts") {
      const ids = await accountsBranchIds(session.id);
      branchList = ids.length
        ? await query(
            "SELECT id, branch_name, branch_code FROM branches WHERE id IN (?) ORDER BY branch_name",
            [ids]
          )
        : [];
    } else {
      branchList = await query(
        "SELECT id, branch_name, branch_code FROM branches WHERE is_active = 1 ORDER BY branch_name"
      );
    }
    if (branchList.length === 0) {
      return NextResponse.json({ ok: false, error: "No branches assigned" }, { status: 400 });
    }

    const allowAll = allowAllBranchesForRole(session.role);
    const scope = resolveBranchScope(resolveActiveBranchParam(session.preferred_branch_param, sp.get("branch")), branchList, allowAll);
    const scopeIds = scopeIdsFrom(scope);
    const branchName = branchScopeLabel(scope, branchList);

    const todayRow = await queryOne<{ today: string }>("SELECT CURDATE() AS today");
    const today = String(todayRow?.today || "").slice(0, 10);
    const { date } = resolveLedgerDay(sp.get("period"), sp.get("date"), today);
    const dayLabel = formatDateOnly(date);
    const isToday = date === today;

    const summary = await getDailyLedgerSummary(scopeIds, date);

    const compassionMode = scope.all
      ? false
      : isCompassionMode(await getBranchProfile(scope.branchId));

    const exactEntries = summary.entries.filter((e) => ledgerEntryGroup(e) === "PCR");
    const pcrRows: LedgerPdfPcrRow[] = [
      ...exactEntries.map((e) => ({
        paidDate: formatDateOnly(e.created_at),
        branch: e.branch_name,
        type: ledgerTypeLabel(e.transaction_type),
        requestNo: ledgerDisplayRequestNo(e) || "-",
        jobNumber: formatJobsForPdf(e.job_number),
        truck: e.truck_numbers || "-",
        trailer: e.trailer_numbers || "-",
        driver: e.driver_names || "-",
        requestedBy: e.requested_by || "-",
        paidTo: e.paid_to || "-",
        zybo: e.zybo_voucher_code || "-",
        pcp: e.pcp_number || "-",
        jv: e.jv_number || "-",
        by: e.created_by_name,
        paidOut: Number(e.debit_amount),
      })),
      ...summary.closedSuspenseEntries.map((c) => ({
        paidDate: formatDateOnly(c.closed_at),
        branch: c.branch_name,
        type: "Closed",
        requestNo: c.closed_request_no || "-",
        jobNumber: formatJobsForPdf(c.job_number),
        truck: c.truck_numbers || "-",
        trailer: c.trailer_numbers || "-",
        driver: c.driver_names || "-",
        requestedBy: c.requested_by || "-",
        paidTo: c.paid_to || "-",
        zybo: c.zybo_voucher_code || "-",
        pcp: c.pcp_number || "-",
        jv: c.jv_number || "-",
        by: c.created_by_name,
        paidOut: Number(c.actual_expense_amount),
      })),
    ].sort((a, b) => a.paidDate.localeCompare(b.paidDate));

    const pcrTotalPaid = pcrRows.reduce((s, r) => s + r.paidOut, 0);

    const osrRows: LedgerPdfOsrRow[] = summary.openSuspenseEntries.map((e) => ({
      paidDate: formatDateOnly(e.paid_at),
      branch: e.branch_name,
      requestNo: e.request_no,
      jobNumber: formatJobsForPdf(e.job_number),
      truck: e.truck_numbers || "-",
      trailer: e.trailer_numbers || "-",
      driver: e.driver_names || "-",
      requestedBy: e.requested_by || "-",
      paidTo: e.paid_to || "-",
      zybo: e.zybo_voucher_code || "-",
      pcp: e.pcp_number || "-",
      jv: e.jv_number || "-",
      by: e.created_by_name,
      outstanding: Number(e.outstanding),
    }));
    const osrTotalOutstanding = osrRows.reduce((s, r) => s + r.outstanding, 0);

    const pdf = await generateLedgerPdf({
      branchName,
      dayLabel,
      showBranch: scope.all,
      compassionMode,
      openingBalance: summary.openingBalance,
      openingBalanceAsPerZybo: summary.openingBalanceAsPerZybo,
      paidOut: summary.totalPaidOut,
      paidLabel: isToday ? "Total Paid today" : "Total Paid",
      totalSuspensePaid: summary.totalSuspensePaid,
      closingBalance: summary.closingBalance,
      balanceAsPerZybo: summary.balanceAsPerZybo,
      pcrRows,
      pcrTotalPaid,
      pcrTotalLabel: isToday ? "Total paid today" : "Total paid out",
      osrRows,
      osrTotalOutstanding,
    });

    const safeDay = date.replace(/-/g, "");
    const safeBranch = branchName.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 40);
    const filename = `ledger_${safeBranch}_${safeDay}.pdf`;

    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    return fail(err);
  }
}
