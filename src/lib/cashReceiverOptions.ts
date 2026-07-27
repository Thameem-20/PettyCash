import { execute, query, queryOne } from "./db";
import {
  DEFAULT_CASH_RECEIVER_OPTIONS,
  isCashReceiverTypeAllowed,
  type CashReceiverOptions,
} from "./cashReceiverOptionsShared";

export type {
  CashReceiverOptions,
  CashReceiverType,
} from "./cashReceiverOptionsShared";
export {
  DEFAULT_CASH_RECEIVER_OPTIONS,
  firstAllowedCashReceiverType,
  isCashReceiverTypeAllowed,
} from "./cashReceiverOptionsShared";

export type UserCashReceiverOptionRow = {
  id: number;
  user_id: number;
  branch_id: number | null;
  allow_myself: number;
  allow_messenger: number;
  allow_supervisor: number;
  note: string | null;
  user_name?: string;
  user_email?: string;
  user_role?: string;
  branch_name?: string | null;
};

function rowToOptions(row: {
  allow_myself: number | boolean;
  allow_messenger: number | boolean;
  allow_supervisor: number | boolean;
}): CashReceiverOptions {
  return {
    myself: Boolean(row.allow_myself),
    messenger: Boolean(row.allow_messenger),
    supervisor: Boolean(row.allow_supervisor),
  };
}

/** Prefer branch-specific override, then all-branches; else all options enabled. */
export async function getCashReceiverOptions(
  userId: number,
  branchId?: number | null
): Promise<CashReceiverOptions> {
  if (!(userId > 0)) return { ...DEFAULT_CASH_RECEIVER_OPTIONS };

  if (branchId != null && branchId > 0) {
    const specific = await queryOne<{
      allow_myself: number;
      allow_messenger: number;
      allow_supervisor: number;
    }>(
      `SELECT allow_myself, allow_messenger, allow_supervisor
         FROM user_cash_receiver_options
        WHERE user_id = ? AND branch_id = ?`,
      [userId, branchId]
    );
    if (specific) return rowToOptions(specific);
  }

  const allBranches = await queryOne<{
    allow_myself: number;
    allow_messenger: number;
    allow_supervisor: number;
  }>(
    `SELECT allow_myself, allow_messenger, allow_supervisor
       FROM user_cash_receiver_options
      WHERE user_id = ? AND branch_id IS NULL`,
    [userId]
  );
  if (allBranches) return rowToOptions(allBranches);

  return { ...DEFAULT_CASH_RECEIVER_OPTIONS };
}

export async function assertCashReceiverTypeAllowed(
  userId: number,
  branchId: number,
  type: string
): Promise<void> {
  const options = await getCashReceiverOptions(userId, branchId);
  if (!isCashReceiverTypeAllowed(options, type)) {
    throw new Error(
      `Cash receiver option "${type}" is not allowed for this user on this branch.`
    );
  }
}

export async function listUserCashReceiverOptions(): Promise<UserCashReceiverOptionRow[]> {
  return query<UserCashReceiverOptionRow>(
    `SELECT o.id, o.user_id, o.branch_id,
            o.allow_myself, o.allow_messenger, o.allow_supervisor, o.note,
            u.name AS user_name, u.email AS user_email, u.role AS user_role,
            b.branch_name
       FROM user_cash_receiver_options o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN branches b ON b.id = o.branch_id
      ORDER BY u.name, o.branch_id IS NOT NULL, b.branch_name`
  );
}

export async function upsertUserCashReceiverOptions(input: {
  userId: number;
  branchId: number | null;
  allowMyself: boolean;
  allowMessenger: boolean;
  allowSupervisor: boolean;
  note?: string | null;
}): Promise<void> {
  if (!input.allowMyself && !input.allowMessenger && !input.allowSupervisor) {
    throw new Error("Select at least one cash receiver option.");
  }
  await execute(
    `INSERT INTO user_cash_receiver_options
       (user_id, branch_id, allow_myself, allow_messenger, allow_supervisor, note)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       allow_myself = VALUES(allow_myself),
       allow_messenger = VALUES(allow_messenger),
       allow_supervisor = VALUES(allow_supervisor),
       note = VALUES(note)`,
    [
      input.userId,
      input.branchId,
      input.allowMyself ? 1 : 0,
      input.allowMessenger ? 1 : 0,
      input.allowSupervisor ? 1 : 0,
      input.note ?? null,
    ]
  );
}

export async function deleteUserCashReceiverOptions(id: number): Promise<boolean> {
  const result = await execute(`DELETE FROM user_cash_receiver_options WHERE id = ?`, [id]);
  return Number(result.affectedRows || 0) > 0;
}
