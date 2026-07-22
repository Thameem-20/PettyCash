-- Per-user approval path exceptions (override branch × role policies).
-- branch_id NULL = applies on every branch for that user.
-- Specific branch rows take precedence over the all-branches row.

CREATE TABLE IF NOT EXISTS user_approval_policy_exceptions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  branch_id     INT NULL,
  approval_path ENUM(
                  'supervisor_then_accounts',
                  'direct_accounts',
                  'accounts_supervisor_then_pay',
                  'self_approve_pending_payment'
                ) NOT NULL,
  note          VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_uape_user   FOREIGN KEY (user_id)   REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_uape_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  -- Generated key so NULL branch_id (all branches) is unique per user in MySQL.
  branch_scope  INT GENERATED ALWAYS AS (IFNULL(branch_id, 0)) STORED,
  UNIQUE KEY uq_user_approval_exception (user_id, branch_scope),
  INDEX idx_uape_user (user_id),
  INDEX idx_uape_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
