import { execute, query, queryOne } from "./db";
import type { Role } from "./types";
import { EXACT_STATUS, SUSPENSE_STATUS } from "./status";
import type { SuspenseChargeScope } from "./chargeTypePolicy";

export type ApprovalPath =
  | "supervisor_then_accounts"
  | "direct_accounts"
  | "accounts_supervisor_then_pay"
  | "self_approve_pending_payment";

export interface BranchApprovalPolicy {
  id: number;
  branch_id: number;
  submitter_role: Role;
  approval_path: ApprovalPath;
  suspense_charge_scope: SuspenseChargeScope;
}

export interface UserApprovalException {
  id: number;
  user_id: number;
  branch_id: number | null;
  approval_path: ApprovalPath;
  note: string | null;
  user_name?: string;
  user_email?: string;
  branch_name?: string | null;
}

const DEFAULT_PATHS: Partial<Record<Role, ApprovalPath>> = {
  cash_requester: "supervisor_then_accounts",
  messenger: "supervisor_then_accounts",
  operations: "supervisor_then_accounts",
  accounts: "accounts_supervisor_then_pay",
  supervisor: "self_approve_pending_payment",
  accounts_supervisor: "self_approve_pending_payment",
  treasury: "supervisor_then_accounts",
  admin: "self_approve_pending_payment",
};

export function defaultApprovalPath(submitterRole: Role): ApprovalPath {
  return DEFAULT_PATHS[submitterRole] ?? "supervisor_then_accounts";
}

/** Prefer user exception (branch-specific, then all-branches), else branch×role policy. */
export async function getApprovalPath(
  branchId: number,
  submitterRole: Role,
  userId?: number | null
): Promise<ApprovalPath> {
  if (userId != null && userId > 0) {
    const specific = await queryOne<{ approval_path: ApprovalPath }>(
      `SELECT approval_path FROM user_approval_policy_exceptions
        WHERE user_id = ? AND branch_id = ?`,
      [userId, branchId]
    );
    if (specific?.approval_path) return specific.approval_path;

    const allBranches = await queryOne<{ approval_path: ApprovalPath }>(
      `SELECT approval_path FROM user_approval_policy_exceptions
        WHERE user_id = ? AND branch_id IS NULL`,
      [userId]
    );
    if (allBranches?.approval_path) return allBranches.approval_path;
  }

  const row = await queryOne<{ approval_path: ApprovalPath }>(
    `SELECT approval_path FROM branch_approval_policies
      WHERE branch_id = ? AND submitter_role = ?`,
    [branchId, submitterRole]
  );
  return row?.approval_path ?? defaultApprovalPath(submitterRole);
}

export async function getSuspenseChargeScope(
  branchId: number,
  submitterRole: Role
): Promise<SuspenseChargeScope> {
  const row = await queryOne<{ suspense_charge_scope: SuspenseChargeScope }>(
    `SELECT suspense_charge_scope FROM branch_approval_policies
      WHERE branch_id = ? AND submitter_role = ?`,
    [branchId, submitterRole]
  );
  return row?.suspense_charge_scope ?? "inherit";
}

export async function listApprovalPolicies(branchId?: number): Promise<BranchApprovalPolicy[]> {
  if (branchId != null) {
    return query<BranchApprovalPolicy>(
      `SELECT id, branch_id, submitter_role, approval_path,
              COALESCE(suspense_charge_scope, 'inherit') AS suspense_charge_scope
         FROM branch_approval_policies WHERE branch_id = ? ORDER BY submitter_role`,
      [branchId]
    );
  }
  return query<BranchApprovalPolicy>(
    `SELECT id, branch_id, submitter_role, approval_path,
            COALESCE(suspense_charge_scope, 'inherit') AS suspense_charge_scope
       FROM branch_approval_policies ORDER BY branch_id, submitter_role`
  );
}

export async function listUserApprovalExceptions(): Promise<UserApprovalException[]> {
  return query<UserApprovalException>(
    `SELECT e.id, e.user_id, e.branch_id, e.approval_path, e.note,
            u.name AS user_name, u.email AS user_email,
            b.branch_name
       FROM user_approval_policy_exceptions e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN branches b ON b.id = e.branch_id
      ORDER BY u.name, e.branch_id IS NOT NULL, b.branch_name`
  );
}

export async function upsertUserApprovalException(input: {
  userId: number;
  branchId: number | null;
  approvalPath: ApprovalPath;
  note?: string | null;
}): Promise<void> {
  await execute(
    `INSERT INTO user_approval_policy_exceptions
       (user_id, branch_id, approval_path, note)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       approval_path = VALUES(approval_path),
       note = VALUES(note)`,
    [input.userId, input.branchId, input.approvalPath, input.note ?? null]
  );
}

export async function deleteUserApprovalException(id: number): Promise<boolean> {
  const result = await execute(
    `DELETE FROM user_approval_policy_exceptions WHERE id = ?`,
    [id]
  );
  return Number(result.affectedRows || 0) > 0;
}

export async function upsertApprovalPolicy(
  branchId: number,
  submitterRole: Role,
  approvalPath: ApprovalPath,
  suspenseChargeScope: SuspenseChargeScope = "inherit"
): Promise<void> {
  await execute(
    `INSERT INTO branch_approval_policies
       (branch_id, submitter_role, approval_path, suspense_charge_scope)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       approval_path = VALUES(approval_path),
       suspense_charge_scope = VALUES(suspense_charge_scope)`,
    [branchId, submitterRole, approvalPath, suspenseChargeScope]
  );
}

export async function setBranchApprovalPolicies(
  branchId: number,
  policies: {
    submitter_role: Role;
    approval_path: ApprovalPath;
    suspense_charge_scope?: SuspenseChargeScope;
  }[]
): Promise<void> {
  for (const p of policies) {
    await upsertApprovalPolicy(
      branchId,
      p.submitter_role,
      p.approval_path,
      p.suspense_charge_scope ?? "inherit"
    );
  }
}

export interface CreateStatusResult {
  status: string;
  approved_amount: number | null;
  needsSupervisor: boolean;
}

/** Map approval path + request type + amount → initial status / approved_amount. */
export function createStateFromApprovalPath(
  path: ApprovalPath,
  requestType: "exact" | "suspense",
  amount: number
): CreateStatusResult {
  switch (path) {
    case "accounts_supervisor_then_pay":
      // Exact: Acc Sup approve & pay. Suspense: Acc Sup approve, then Accounts issue.
      return {
        status: EXACT_STATUS.PENDING_ACC_SUP,
        approved_amount: null,
        needsSupervisor: false,
      };
    case "self_approve_pending_payment":
      return {
        status:
          requestType === "exact"
            ? EXACT_STATUS.PENDING_PAYMENT
            : SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE,
        approved_amount: amount,
        needsSupervisor: false,
      };
    case "direct_accounts":
      return {
        status:
          requestType === "exact"
            ? EXACT_STATUS.PENDING_PAYMENT
            : SUSPENSE_STATUS.PENDING_ACCOUNTS_ISSUE,
        approved_amount: amount,
        needsSupervisor: false,
      };
    case "supervisor_then_accounts":
    default:
      return {
        status:
          requestType === "exact"
            ? EXACT_STATUS.PENDING_SUPERVISOR
            : SUSPENSE_STATUS.PENDING_SUPERVISOR,
        approved_amount: null,
        needsSupervisor: true,
      };
  }
}

export const APPROVAL_PATH_LABELS: Record<ApprovalPath, string> = {
  supervisor_then_accounts: "Supervisor → Accounts",
  direct_accounts: "Direct to Accounts",
  accounts_supervisor_then_pay: "Accounts Supervisor → Pay",
  self_approve_pending_payment: "Self-approve → Pending Payment",
};

export const POLICY_SUBMITTER_ROLES: Role[] = [
  "cash_requester",
  "messenger",
  "operations",
  "supervisor",
  "accounts",
  "accounts_supervisor",
  "treasury",
  "admin",
];
