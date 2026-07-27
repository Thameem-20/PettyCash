-- Per-user cash receiver option overrides for Ops (and similar) submitters.
-- branch_id NULL = applies on every branch for that user.
-- Specific branch rows take precedence over the all-branches row.
-- No row = Myself, Messenger, and Supervisor are all available.

CREATE TABLE IF NOT EXISTS user_cash_receiver_options (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  user_id           INT NOT NULL,
  branch_id         INT NULL,
  allow_myself      TINYINT(1) NOT NULL DEFAULT 1,
  allow_messenger   TINYINT(1) NOT NULL DEFAULT 1,
  allow_supervisor  TINYINT(1) NOT NULL DEFAULT 1,
  note              VARCHAR(255) NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ucro_user   FOREIGN KEY (user_id)   REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_ucro_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  -- Generated key so NULL branch_id (all branches) is unique per user in MySQL.
  branch_scope      INT GENERATED ALWAYS AS (IFNULL(branch_id, 0)) STORED,
  UNIQUE KEY uq_user_cash_receiver_options (user_id, branch_scope),
  INDEX idx_ucro_user (user_id),
  INDEX idx_ucro_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
