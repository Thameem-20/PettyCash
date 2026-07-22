-- Split Cash Requester (submitters) from Messenger (cash receivers).
-- Existing messenger users become cash_requester; messenger remains for receivers.

-- users.role
ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'cash_requester','messenger','operations','supervisor',
    'accounts','accounts_supervisor','treasury','admin'
  ) NOT NULL;

-- user_branch_roles.role
ALTER TABLE user_branch_roles
  MODIFY COLUMN role ENUM(
    'cash_requester','messenger','operations','supervisor',
    'accounts','accounts_supervisor','treasury','admin'
  ) NOT NULL;

-- branch_approval_policies.submitter_role
ALTER TABLE branch_approval_policies
  MODIFY COLUMN submitter_role ENUM(
    'cash_requester','messenger','operations','supervisor',
    'accounts','accounts_supervisor','treasury','admin'
  ) NOT NULL;

-- Migrate existing submitters (old messenger) → cash_requester
UPDATE users SET role = 'cash_requester' WHERE role = 'messenger';

UPDATE user_branch_roles SET role = 'cash_requester' WHERE role = 'messenger';

UPDATE branch_approval_policies
   SET submitter_role = 'cash_requester'
 WHERE submitter_role = 'messenger';

UPDATE petty_cash_requests
   SET submitter_role = 'cash_requester'
 WHERE submitter_role = 'messenger';

-- Seed default approval policy for messenger (cash receivers who may also submit)
INSERT IGNORE INTO branch_approval_policies (branch_id, submitter_role, approval_path, suspense_charge_scope)
SELECT branch_id, 'messenger', approval_path, suspense_charge_scope
  FROM branch_approval_policies
 WHERE submitter_role = 'cash_requester';
