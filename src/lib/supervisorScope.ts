/** SQL fragment: this supervisor actually approved the request. */
export function supervisorApprovedExistsSql(alias = "r"): string {
  return `EXISTS (
    SELECT 1 FROM approvals a
     WHERE a.request_id = ${alias}.id
       AND a.approver_user_id = ?
       AND a.approval_level = 'supervisor'
       AND a.action IN ('approve', 'edit_amount')
  )`;
}

/** SQL fragment: this supervisor rejected / returned the request. */
export function supervisorActionExistsSql(actions: string[], alias = "r"): string {
  const ph = actions.map(() => "?").join(",");
  return `EXISTS (
    SELECT 1 FROM approvals a
     WHERE a.request_id = ${alias}.id
       AND a.approver_user_id = ?
       AND a.approval_level = 'supervisor'
       AND a.action IN (${ph})
  )`;
}
