export type Role =
  | "cash_requester"
  | "messenger"
  | "operations"
  | "supervisor"
  | "accounts"
  | "accounts_supervisor"
  | "treasury"
  | "admin";

/** Roles that submit field petty-cash requests (not cash-receiver messengers). */
export const CASH_SUBMITTER_ROLES: Role[] = ["cash_requester", "messenger", "operations"];

export function isCashSubmitterRole(role: Role | string | null | undefined): boolean {
  return role === "cash_requester" || role === "messenger" || role === "operations";
}

export type RequestType = "exact" | "suspense";
export type ChargeType = "job" | "non_job" | "truck_trailer" | "general";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  /** Effective role for the active workspace branch (or primary fallback). */
  role: Role;
  /** Primary role from users.role (JWT), before branch membership override. */
  primary_role?: Role;
  default_branch_id: number | null;
  /** Workspace preference from DB: "all" or numeric id string. */
  preferred_branch_param?: string;
  /** Numeric preferred branch when a specific branch is selected (not "all"). */
  active_branch_id?: number | null;
}

export interface Branch {
  id: number;
  branch_name: string;
  branch_code: string;
  currency: string;
  opening_balance: number;
  current_cash_balance: number;
  notes: string | null;
  is_active: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  department: string | null;
  default_branch_id: number | null;
  supervisor_id: number | null;
  is_active: number;
  created_at: string;
}

export interface ExpenseCategory {
  id: number;
  category_name: string;
  charge_type: ChargeType;
  job_number_required: number;
  is_active: number;
}

export interface JobCodeMapping {
  id: number;
  job_code: string;
  branch_id: number;
  description: string | null;
  is_active: number;
}

export interface PettyCashRequest {
  id: number;
  request_no: string;
  closed_request_no: string | null;
  request_type: RequestType;
  charge_type: ChargeType;
  category_id: number;
  submitted_by_user_id: number;
  submitter_role: Role | null;
  cash_receiver_user_id: number | null;
  cash_receiver_label: string | null;
  branch_id: number;
  job_number: string | null;
  description: string | null;
  requested_amount: number;
  approved_amount: number | null;
  paid_amount: number | null;
  actual_expense_amount: number | null;
  returned_amount: number | null;
  additional_paid_amount: number | null;
  currency: string;
  status: string;
  supervisor_id: number | null;
  accounts_user_id: number | null;
  processing_by_user_id: number | null;
  branch_override: number;
  reject_reason: string | null;
  created_at: string;
  approved_at: string | null;
  paid_at: string | null;
  closed_at: string | null;
  zybo_voucher_suffix: string | null;
  zybo_voucher_code: string | null;
  zybo_voucher_at: string | null;
  pcp_number: string | null;
  jv_number: string | null;
  pcp_jv_at: string | null;
}

export interface BankAccount {
  id: number;
  branch_id: number;
  bank_name: string;
  last_four: string;
  is_active: number;
  created_at: string;
  branch_name?: string;
  branch_code?: string;
}

export interface TopUpRequest {
  id: number;
  top_up_no: string;
  branch_id: number;
  requested_by_user_id: number;
  amount: number;
  reason: string | null;
  cp_number: string | null;
  payment_source: "cash" | "bank_account";
  bank_account_id: number | null;
  bank_account_label: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  accounts_supervisor_status: "pending" | "approved" | "rejected";
  treasury_status: "pending" | "approved" | "rejected";
  treasury_released_status: "pending" | "released";
  accounts_received_status: "pending" | "received";
  status: string;
  comments: string | null;
  created_at: string;
}
