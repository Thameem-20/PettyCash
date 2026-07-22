-- Tie bank accounts to a branch so top-ups only show banks for that branch.

ALTER TABLE bank_accounts
  ADD COLUMN branch_id INT NULL AFTER id;

UPDATE bank_accounts
   SET branch_id = (
     SELECT id FROM branches WHERE is_active = 1 ORDER BY id LIMIT 1
   )
 WHERE branch_id IS NULL;

ALTER TABLE bank_accounts
  MODIFY COLUMN branch_id INT NOT NULL,
  ADD CONSTRAINT fk_bank_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  DROP INDEX uq_bank_last_four,
  ADD UNIQUE KEY uq_branch_bank_last_four (branch_id, bank_name, last_four),
  ADD INDEX idx_bank_branch (branch_id);
