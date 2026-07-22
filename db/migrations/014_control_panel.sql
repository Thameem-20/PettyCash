-- Control Panel foundation: per-branch roles, branch profiles, approval policies.

CREATE TABLE IF NOT EXISTS user_branch_roles (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  branch_id  INT NOT NULL,
  role       ENUM('messenger','operations','supervisor','accounts','accounts_supervisor','treasury','admin') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ubr_user   FOREIGN KEY (user_id)   REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_ubr_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_branch_role (user_id, branch_id),
  INDEX idx_ubr_branch (branch_id),
  INDEX idx_ubr_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS branch_profiles (
  branch_id                   INT NOT NULL PRIMARY KEY,
  request_mode                ENUM('job_based','compassion') NOT NULL DEFAULT 'job_based',
  coding_type                 ENUM('zybo','pcp_jv','none') NOT NULL DEFAULT 'zybo',
  default_supervisor_user_id  INT NULL,
  allow_suspense              TINYINT(1) NOT NULL DEFAULT 1,
  created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bp_branch     FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_bp_supervisor FOREIGN KEY (default_supervisor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS branch_approval_policies (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  branch_id       INT NOT NULL,
  submitter_role  ENUM('messenger','operations','supervisor','accounts','accounts_supervisor','treasury','admin') NOT NULL,
  approval_path   ENUM(
                    'supervisor_then_accounts',
                    'direct_accounts',
                    'accounts_supervisor_then_pay',
                    'self_approve_pending_payment'
                  ) NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bap_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  UNIQUE KEY uq_branch_submitter_role (branch_id, submitter_role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Profiles for every branch (Compassion gets special defaults).
INSERT INTO branch_profiles (branch_id, request_mode, coding_type, allow_suspense)
SELECT b.id,
       CASE WHEN b.branch_code = 'COMP' THEN 'compassion' ELSE 'job_based' END,
       CASE WHEN b.branch_code = 'COMP' THEN 'pcp_jv' ELSE 'zybo' END,
       1
  FROM branches b
ON DUPLICATE KEY UPDATE
  request_mode = VALUES(request_mode),
  coding_type = VALUES(coding_type);

-- Compassion default supervisor: prefer supervisor with COMP default branch, else Asif.
UPDATE branch_profiles bp
  JOIN branches b ON b.id = bp.branch_id AND b.branch_code = 'COMP'
  SET bp.default_supervisor_user_id = (
    SELECT u.id FROM users u
     WHERE u.role = 'supervisor' AND u.is_active = 1 AND u.default_branch_id = b.id
     ORDER BY u.id ASC LIMIT 1
  )
WHERE bp.default_supervisor_user_id IS NULL;

UPDATE branch_profiles bp
  JOIN branches b ON b.id = bp.branch_id AND b.branch_code = 'COMP'
  SET bp.default_supervisor_user_id = (
    SELECT u.id FROM users u
     WHERE u.role = 'supervisor' AND u.is_active = 1
       AND (u.name LIKE '%Asif%' OR u.email LIKE '%asif%')
     ORDER BY u.id ASC LIMIT 1
  )
WHERE bp.default_supervisor_user_id IS NULL;

-- Memberships from users.default_branch_id + users.role
INSERT IGNORE INTO user_branch_roles (user_id, branch_id, role)
SELECT u.id, u.default_branch_id, u.role
  FROM users u
 WHERE u.default_branch_id IS NOT NULL
   AND u.is_active = 1;

-- Accounts handlers: membership per accessible branch
INSERT IGNORE INTO user_branch_roles (user_id, branch_id, role)
SELECT uba.user_id, uba.branch_id, u.role
  FROM user_branch_access uba
  JOIN users u ON u.id = uba.user_id
 WHERE u.role IN ('accounts', 'accounts_supervisor', 'admin')
   AND u.is_active = 1;

-- Approval policies for every branch (current product defaults)
INSERT IGNORE INTO branch_approval_policies (branch_id, submitter_role, approval_path)
SELECT b.id, r.role, r.path
  FROM branches b
  CROSS JOIN (
    SELECT 'messenger' AS role, 'supervisor_then_accounts' AS path
    UNION ALL SELECT 'operations', 'supervisor_then_accounts'
    UNION ALL SELECT 'accounts', 'accounts_supervisor_then_pay'
    UNION ALL SELECT 'supervisor', 'self_approve_pending_payment'
    UNION ALL SELECT 'accounts_supervisor', 'self_approve_pending_payment'
    UNION ALL SELECT 'treasury', 'supervisor_then_accounts'
    UNION ALL SELECT 'admin', 'self_approve_pending_payment'
  ) r;
