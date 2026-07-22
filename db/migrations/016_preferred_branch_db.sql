-- Store workspace branch preference on the user (replaces pc_branch cookie).

ALTER TABLE users
  ADD COLUMN preferred_branch_id INT NULL AFTER default_branch_id,
  ADD COLUMN prefer_all_branches TINYINT(1) NOT NULL DEFAULT 0 AFTER preferred_branch_id,
  ADD CONSTRAINT fk_users_preferred_branch
    FOREIGN KEY (preferred_branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  ADD INDEX idx_users_preferred_branch (preferred_branch_id);

-- Seed from default branch so CLI (and other) defaults apply immediately.
UPDATE users
   SET preferred_branch_id = default_branch_id
 WHERE preferred_branch_id IS NULL
   AND default_branch_id IS NOT NULL;
