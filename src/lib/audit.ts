import { PoolConnection, execute } from "./db";

interface AuditEntry {
  userId: number | null;
  action: string;
  entityType: string;
  entityId: number | null;
  oldValue?: unknown;
  newValue?: unknown;
}

function ser(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Write an audit log row (standalone). */
export async function audit(entry: AuditEntry): Promise<void> {
  await execute(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [entry.userId, entry.action, entry.entityType, entry.entityId, ser(entry.oldValue), ser(entry.newValue)]
  );
}

/** Write an audit log row inside an existing transaction. */
export async function auditTx(conn: PoolConnection, entry: AuditEntry): Promise<void> {
  await conn.execute(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [entry.userId, entry.action, entry.entityType, entry.entityId, ser(entry.oldValue), ser(entry.newValue)]
  );
}
