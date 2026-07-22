-- Admin-managed bank accounts for top-up payment source.
CREATE TABLE IF NOT EXISTS bank_accounts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  bank_name   VARCHAR(120) NOT NULL,
  last_four   CHAR(4) NOT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bank_last_four (bank_name, last_four)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE top_up_requests
  ADD COLUMN bank_account_id INT NULL AFTER payment_source,
  ADD COLUMN bank_account_label VARCHAR(160) NULL AFTER bank_account_id,
  ADD CONSTRAINT fk_topup_bank FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;
