-- Snapshot of creator role at request create time (staff reimbursement routing).
ALTER TABLE petty_cash_requests
  ADD COLUMN submitter_role VARCHAR(32) NULL AFTER submitted_by_user_id;
