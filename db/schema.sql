-- =====================================================================
-- Petty Cash Management System - Database Schema
-- MySQL 8.x
--
-- Usage:
--   1. Create the database (name must match DB_NAME in .env.local):
--        CREATE DATABASE petty_cash CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--        USE petty_cash;
--   2. Run this file (schema.sql) first.
--   3. Then run seed.sql to load master + demo data.
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS app_settings;
DROP TABLE IF EXISTS top_up_requests;
DROP TABLE IF EXISTS bank_accounts;
DROP TABLE IF EXISTS cash_ledger;
DROP TABLE IF EXISTS approvals;
DROP TABLE IF EXISTS suspense_returns;
DROP TABLE IF EXISTS receipts;
DROP TABLE IF EXISTS request_charges;
DROP TABLE IF EXISTS request_job_numbers;
DROP TABLE IF EXISTS petty_cash_requests;
DROP TABLE IF EXISTS expense_categories;
DROP TABLE IF EXISTS compassion_presets;
DROP TABLE IF EXISTS compassion_drivers;
DROP TABLE IF EXISTS fleet_vehicles;
DROP TABLE IF EXISTS job_code_mapping;
DROP TABLE IF EXISTS user_cash_receiver_options;
DROP TABLE IF EXISTS user_approval_policy_exceptions;
DROP TABLE IF EXISTS branch_approval_policies;
DROP TABLE IF EXISTS branch_profiles;
DROP TABLE IF EXISTS user_branch_roles;
DROP TABLE IF EXISTS user_branch_access;
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- branches: each branch is a separate cashbox. Balances never mix.
-- ---------------------------------------------------------------------
CREATE TABLE branches (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  branch_name         VARCHAR(120) NOT NULL,
  branch_code         VARCHAR(30)  NOT NULL UNIQUE,
  currency            VARCHAR(10)  NOT NULL DEFAULT 'AED',
  opening_balance     DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  current_cash_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  notes               VARCHAR(255) NULL,
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- users
-- role: cash_requester | messenger | operations | supervisor | accounts |
--       accounts_supervisor | treasury | admin
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(120) NOT NULL,
  email             VARCHAR(180) NOT NULL UNIQUE,
  password_hash     VARCHAR(255) NOT NULL,
  role              ENUM('cash_requester','messenger','operations','supervisor','accounts','accounts_supervisor','treasury','admin') NOT NULL,
  department        VARCHAR(120) NULL,
  default_branch_id   INT NULL,
  preferred_branch_id INT NULL,
  prefer_all_branches TINYINT(1) NOT NULL DEFAULT 0,
  supervisor_id       INT NULL,
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_default_branch FOREIGN KEY (default_branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_users_preferred_branch FOREIGN KEY (preferred_branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_users_supervisor    FOREIGN KEY (supervisor_id)     REFERENCES users(id)    ON DELETE SET NULL,
  INDEX idx_users_role (role),
  INDEX idx_users_default_branch (default_branch_id),
  INDEX idx_users_preferred_branch (preferred_branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- user_branch_access: which branches an accounts user can handle/view.
-- access_type: handler (can process payments) | view (read only)
-- ---------------------------------------------------------------------
CREATE TABLE user_branch_access (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  branch_id   INT NOT NULL,
  access_type ENUM('handler','view') NOT NULL DEFAULT 'handler',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_uba_user   FOREIGN KEY (user_id)   REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_uba_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_branch (user_id, branch_id),
  INDEX idx_uba_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- user_branch_roles: per-branch role membership (multi-role users).
-- users.role remains primary/fallback for login.
-- ---------------------------------------------------------------------
CREATE TABLE user_branch_roles (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  branch_id  INT NOT NULL,
  role       ENUM('cash_requester','messenger','operations','supervisor','accounts','accounts_supervisor','treasury','admin') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ubr_user   FOREIGN KEY (user_id)   REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_ubr_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_branch_role (user_id, branch_id),
  INDEX idx_ubr_branch (branch_id),
  INDEX idx_ubr_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- branch_profiles: per-branch behaviour (fields, coding, default supervisor).
-- ---------------------------------------------------------------------
CREATE TABLE branch_profiles (
  branch_id                   INT NOT NULL PRIMARY KEY,
  request_mode                ENUM('job_based','compassion') NOT NULL DEFAULT 'job_based',
  coding_type                 ENUM('zybo','pcp_jv','none') NOT NULL DEFAULT 'zybo',
  default_supervisor_user_id  INT NULL,
  allow_suspense              TINYINT(1) NOT NULL DEFAULT 1,
  charge_type_scope           ENUM('job_and_non_job','job_only','non_job_only') NOT NULL DEFAULT 'job_and_non_job',
  created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bp_branch     FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_bp_supervisor FOREIGN KEY (default_supervisor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- branch_approval_policies: approval path per branch + submitter role.
-- ---------------------------------------------------------------------
CREATE TABLE branch_approval_policies (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  branch_id       INT NOT NULL,
  submitter_role  ENUM('cash_requester','messenger','operations','supervisor','accounts','accounts_supervisor','treasury','admin') NOT NULL,
  approval_path   ENUM(
                    'supervisor_then_accounts',
                    'direct_accounts',
                    'accounts_supervisor_then_pay',
                    'self_approve_pending_payment'
                  ) NOT NULL,
  suspense_charge_scope ENUM('inherit','job_and_non_job','job_only','non_job_only') NOT NULL DEFAULT 'inherit',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bap_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  UNIQUE KEY uq_branch_submitter_role (branch_id, submitter_role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- user_approval_policy_exceptions: per-user path overrides (branch optional).
-- branch_id NULL = all branches; specific branch wins over all-branches.
-- ---------------------------------------------------------------------
CREATE TABLE user_approval_policy_exceptions (
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
  allow_non_job TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_uape_user   FOREIGN KEY (user_id)   REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_uape_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  branch_scope  INT GENERATED ALWAYS AS (IFNULL(branch_id, 0)) STORED,
  UNIQUE KEY uq_user_approval_exception (user_id, branch_scope),
  INDEX idx_uape_user (user_id),
  INDEX idx_uape_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- user_cash_receiver_options: per-user cash receiver option overrides.
-- branch_id NULL = all branches; specific branch wins over all-branches.
-- No row = Myself, Messenger, and Supervisor are all available.
-- ---------------------------------------------------------------------
CREATE TABLE user_cash_receiver_options (
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
  branch_scope      INT GENERATED ALWAYS AS (IFNULL(branch_id, 0)) STORED,
  UNIQUE KEY uq_user_cash_receiver_options (user_id, branch_scope),
  INDEX idx_ucro_user (user_id),
  INDEX idx_ucro_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- job_code_mapping: first segment of a job number -> branch.
-- e.g. 101 -> Dubai, 102 -> Dubai Projects
-- ---------------------------------------------------------------------
CREATE TABLE job_code_mapping (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  job_code    VARCHAR(30) NOT NULL UNIQUE,
  branch_id   INT NOT NULL,
  description VARCHAR(180) NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_jcm_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  INDEX idx_jcm_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- compassion_drivers: preset drivers for Compassion (COMP) requests
-- ---------------------------------------------------------------------
CREATE TABLE compassion_drivers (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_compassion_driver_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- compassion_presets: truck / trailer / description quick-fill lists
-- ---------------------------------------------------------------------
CREATE TABLE compassion_presets (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  kind       ENUM('truck','trailer','description') NOT NULL,
  value      VARCHAR(180) NOT NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_compassion_preset (kind, value),
  INDEX idx_compassion_preset_kind (kind, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- expense_categories
-- charge_type: job | non_job | truck_trailer | general
-- ---------------------------------------------------------------------
CREATE TABLE expense_categories (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  category_name       VARCHAR(120) NOT NULL,
  charge_type         ENUM('job','non_job','truck_trailer','general') NOT NULL,
  job_number_required TINYINT(1) NOT NULL DEFAULT 0,
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cat_charge_type (charge_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- petty_cash_requests: the central document.
-- request_type: exact | suspense
-- charge_type:  job | non_job
-- status: see src/lib/status.ts for the full state machines.
-- ---------------------------------------------------------------------
CREATE TABLE petty_cash_requests (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  request_no            VARCHAR(40) NOT NULL UNIQUE,
  closed_request_no     VARCHAR(40) NULL,
  request_type          ENUM('exact','suspense') NOT NULL,
  charge_type           ENUM('job','non_job','truck_trailer','general') NOT NULL,
  category_id           INT NOT NULL,
  submitted_by_user_id  INT NOT NULL,
  submitter_role        VARCHAR(32) NULL,
  cash_receiver_user_id INT NULL,
  cash_receiver_label   VARCHAR(120) NULL,
  branch_id             INT NOT NULL,
  job_number            VARCHAR(80) NULL,
  description           TEXT NULL,
  requested_amount      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  approved_amount       DECIMAL(12,2) NULL,
  paid_amount           DECIMAL(12,2) NULL,
  actual_expense_amount DECIMAL(12,2) NULL,
  returned_amount       DECIMAL(12,2) NULL,
  additional_paid_amount DECIMAL(12,2) NULL,
  currency              VARCHAR(10) NOT NULL DEFAULT 'AED',
  status                VARCHAR(50) NOT NULL,
  supervisor_id         INT NULL,
  accounts_user_id      INT NULL,
  processing_by_user_id INT NULL,
  branch_override       TINYINT(1) NOT NULL DEFAULT 0,
  reject_reason         VARCHAR(500) NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  approved_at           DATETIME NULL,
  paid_at              DATETIME NULL,
  closed_at            DATETIME NULL,
  zybo_voucher_suffix  VARCHAR(40) NULL,
  zybo_voucher_code    VARCHAR(40) NULL,
  zybo_voucher_at      DATETIME NULL,
  pcp_number           VARCHAR(80) NULL,
  jv_number            VARCHAR(80) NULL,
  pcp_jv_at            DATETIME NULL,
  CONSTRAINT fk_req_category   FOREIGN KEY (category_id)           REFERENCES expense_categories(id),
  CONSTRAINT fk_req_submitter  FOREIGN KEY (submitted_by_user_id)  REFERENCES users(id),
  CONSTRAINT fk_req_receiver   FOREIGN KEY (cash_receiver_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_req_branch     FOREIGN KEY (branch_id)             REFERENCES branches(id),
  CONSTRAINT fk_req_supervisor FOREIGN KEY (supervisor_id)         REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_req_accounts   FOREIGN KEY (accounts_user_id)      REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_req_processing FOREIGN KEY (processing_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_req_status (status),
  INDEX idx_req_branch (branch_id),
  INDEX idx_req_submitter (submitted_by_user_id),
  INDEX idx_req_type (request_type),
  INDEX idx_req_created (created_at),
  INDEX idx_req_closed_no (closed_request_no),
  INDEX idx_req_zybo_voucher (zybo_voucher_code),
  INDEX idx_req_pcp_number (pcp_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- request_job_numbers: one or more job numbers per job-related request.
-- petty_cash_requests.job_number keeps the primary (first) value for compat.
-- ---------------------------------------------------------------------
CREATE TABLE request_job_numbers (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  request_id  INT NOT NULL,
  job_number  VARCHAR(80) NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rjn_request FOREIGN KEY (request_id) REFERENCES petty_cash_requests(id) ON DELETE CASCADE,
  INDEX idx_rjn_request (request_id),
  INDEX idx_rjn_job_number (job_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- request_charges: line items under a single request (job, desc, amount).
-- petty_cash_requests.requested_amount / description stay as totals/summary.
-- ---------------------------------------------------------------------
CREATE TABLE request_charges (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  request_id   INT NOT NULL,
  sort_order   SMALLINT NOT NULL DEFAULT 0,
  description  TEXT NOT NULL,
  amount       DECIMAL(12,2) NOT NULL,
  actual_amount DECIMAL(12,2) NULL,
  job_number   VARCHAR(80) NULL,
  truck_number VARCHAR(80) NULL,
  trailer_number VARCHAR(80) NULL,
  driver_id    INT NULL,
  fuel_from_km DECIMAL(12,2) NULL,
  fuel_to_km   DECIMAL(12,2) NULL,
  fuel_liters  DECIMAL(12,3) NULL,
  vehicle_number VARCHAR(80) NULL,
  vehicle_label  VARCHAR(120) NULL,
  category_id  INT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rc_request FOREIGN KEY (request_id) REFERENCES petty_cash_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_rc_category FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_rc_driver FOREIGN KEY (driver_id) REFERENCES compassion_drivers(id) ON DELETE SET NULL,
  INDEX idx_rc_request (request_id),
  INDEX idx_rc_job_number (job_number),
  INDEX idx_rc_truck (truck_number),
  INDEX idx_rc_trailer (trailer_number),
  INDEX idx_rc_vehicle (vehicle_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- receipts: uploaded receipt/invoice images.
-- receipt_type: request (at submission) | settlement (final receipt)
-- charge_id: optional link to a request_charges row for submission receipts
-- ---------------------------------------------------------------------
CREATE TABLE receipts (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  request_id         INT NOT NULL,
  charge_id          INT NULL,
  file_url           VARCHAR(400) NOT NULL,
  file_name          VARCHAR(255) NOT NULL,
  mime_type          VARCHAR(120) NULL,
  uploaded_by_user_id INT NOT NULL,
  receipt_type       ENUM('request','settlement') NOT NULL DEFAULT 'request',
  uploaded_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_receipt_request  FOREIGN KEY (request_id)          REFERENCES petty_cash_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_receipt_charge   FOREIGN KEY (charge_id)           REFERENCES request_charges(id) ON DELETE SET NULL,
  CONSTRAINT fk_receipt_uploader FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id),
  INDEX idx_receipt_request (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- approvals: every approval/rejection/return + amount edits.
-- approval_level: supervisor | accounts | accounts_supervisor | treasury
-- action: approve | reject | return | edit_amount | pay | issue | settle
-- ---------------------------------------------------------------------
CREATE TABLE approvals (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  request_id       INT NOT NULL,
  approver_user_id INT NOT NULL,
  approval_level   VARCHAR(40) NOT NULL,
  action           VARCHAR(40) NOT NULL,
  comments         VARCHAR(800) NULL,
  old_amount       DECIMAL(12,2) NULL,
  new_amount       DECIMAL(12,2) NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_appr_request  FOREIGN KEY (request_id)       REFERENCES petty_cash_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_appr_approver FOREIGN KEY (approver_user_id) REFERENCES users(id),
  INDEX idx_appr_request (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- suspense_returns: partial cash returns while a suspense stays open.
-- petty_cash_requests.returned_amount is kept as the running total.
-- ---------------------------------------------------------------------
CREATE TABLE suspense_returns (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  request_id      INT NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  note            VARCHAR(500) NULL,
  recorded_by_user_id INT NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sr_request FOREIGN KEY (request_id) REFERENCES petty_cash_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_sr_user FOREIGN KEY (recorded_by_user_id) REFERENCES users(id),
  INDEX idx_sr_request (request_id),
  INDEX idx_sr_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- cash_ledger: one row per cash movement per branch.
-- transaction_type:
--   exact_paid | suspense_issued | suspense_returned |
--   additional_paid | topup_received | adjustment
-- ---------------------------------------------------------------------
CREATE TABLE cash_ledger (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  branch_id         INT NOT NULL,
  request_id        INT NULL,
  top_up_id         INT NULL,
  transaction_type  VARCHAR(40) NOT NULL,
  debit_amount      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  credit_amount     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  running_balance   DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  created_by_user_id INT NOT NULL,
  remarks           VARCHAR(500) NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ledger_branch  FOREIGN KEY (branch_id)          REFERENCES branches(id),
  CONSTRAINT fk_ledger_request FOREIGN KEY (request_id)         REFERENCES petty_cash_requests(id) ON DELETE SET NULL,
  CONSTRAINT fk_ledger_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  INDEX idx_ledger_branch (branch_id),
  INDEX idx_ledger_request (request_id),
  INDEX idx_ledger_type (transaction_type),
  INDEX idx_ledger_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- bank_accounts: admin-managed accounts for top-up bank payment source.
-- ---------------------------------------------------------------------
CREATE TABLE bank_accounts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  branch_id   INT NOT NULL,
  bank_name   VARCHAR(120) NOT NULL,
  last_four   CHAR(4) NOT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bank_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  UNIQUE KEY uq_branch_bank_last_four (branch_id, bank_name, last_four),
  INDEX idx_bank_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- top_up_requests: branch cashbox refill workflow.
-- status: see src/lib/status.ts (TOPUP_STATUS).
-- ---------------------------------------------------------------------
CREATE TABLE top_up_requests (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  top_up_no                VARCHAR(40) NOT NULL UNIQUE,
  branch_id                INT NOT NULL,
  requested_by_user_id     INT NOT NULL,
  amount                   DECIMAL(12,2) NOT NULL,
  reason                   VARCHAR(500) NULL,
  cp_number                VARCHAR(80) NULL,
  payment_source           VARCHAR(20) NOT NULL DEFAULT 'cash',
  bank_account_id          INT NULL,
  bank_account_label       VARCHAR(160) NULL,
  attachment_url           VARCHAR(400) NULL,
  attachment_name          VARCHAR(255) NULL,
  attachment_mime          VARCHAR(120) NULL,
  accounts_supervisor_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  treasury_status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  treasury_released_status ENUM('pending','released') NOT NULL DEFAULT 'pending',
  accounts_received_status ENUM('pending','received') NOT NULL DEFAULT 'pending',
  status                   VARCHAR(50) NOT NULL,
  accounts_supervisor_id   INT NULL,
  treasury_user_id         INT NULL,
  comments                 VARCHAR(800) NULL,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  supervisor_approved_at   DATETIME NULL,
  treasury_approved_at     DATETIME NULL,
  cash_released_at         DATETIME NULL,
  accounts_received_at     DATETIME NULL,
  CONSTRAINT fk_topup_branch    FOREIGN KEY (branch_id)            REFERENCES branches(id),
  CONSTRAINT fk_topup_requester FOREIGN KEY (requested_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_topup_accsup    FOREIGN KEY (accounts_supervisor_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_topup_treasury  FOREIGN KEY (treasury_user_id)     REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_topup_bank      FOREIGN KEY (bank_account_id)      REFERENCES bank_accounts(id) ON DELETE SET NULL,
  INDEX idx_topup_branch (branch_id),
  INDEX idx_topup_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- link ledger top_up_id after both tables exist
ALTER TABLE cash_ledger
  ADD CONSTRAINT fk_ledger_topup FOREIGN KEY (top_up_id) REFERENCES top_up_requests(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- push_subscriptions: Web Push endpoints per user/device.
-- ---------------------------------------------------------------------
CREATE TABLE push_subscriptions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  endpoint     VARCHAR(512) NOT NULL,
  p256dh       VARCHAR(255) NOT NULL,
  auth         VARCHAR(255) NOT NULL,
  user_agent   VARCHAR(255) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_endpoint (endpoint),
  INDEX idx_push_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- fleet_vehicles: plate + car name for fuel charge requests.
-- ---------------------------------------------------------------------
CREATE TABLE fleet_vehicles (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  plate_no   VARCHAR(80) NOT NULL,
  label      VARCHAR(120) NOT NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fleet_plate (plate_no),
  INDEX idx_fleet_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- audit_logs: every meaningful mutation.
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NULL,
  action      VARCHAR(80) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id   INT NULL,
  old_value   TEXT NULL,
  new_value   TEXT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- app_settings: key/value app-wide preferences (e.g. color theme).
-- ---------------------------------------------------------------------
CREATE TABLE app_settings (
  setting_key   VARCHAR(64)  NOT NULL PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
