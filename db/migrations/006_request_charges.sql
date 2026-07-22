-- Multiple charges (line items) under a single petty cash request.
CREATE TABLE IF NOT EXISTS request_charges (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  request_id   INT NOT NULL,
  sort_order   SMALLINT NOT NULL DEFAULT 0,
  description  TEXT NOT NULL,
  amount       DECIMAL(12,2) NOT NULL,
  job_number   VARCHAR(80) NULL,
  category_id  INT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rc_request FOREIGN KEY (request_id) REFERENCES petty_cash_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_rc_category FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE SET NULL,
  INDEX idx_rc_request (request_id),
  INDEX idx_rc_job_number (job_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Link submission receipts to a specific charge (settlement receipts stay request-level).
ALTER TABLE receipts
  ADD COLUMN charge_id INT NULL AFTER request_id,
  ADD INDEX idx_receipt_charge (charge_id),
  ADD CONSTRAINT fk_receipt_charge FOREIGN KEY (charge_id) REFERENCES request_charges(id) ON DELETE SET NULL;

-- Backfill: one charge per existing request.
INSERT INTO request_charges (request_id, sort_order, description, amount, job_number, category_id)
SELECT
  r.id,
  0,
  COALESCE(NULLIF(TRIM(r.description), ''), c.category_name),
  r.requested_amount,
  r.job_number,
  r.category_id
FROM petty_cash_requests r
JOIN expense_categories c ON c.id = r.category_id
WHERE NOT EXISTS (SELECT 1 FROM request_charges rc WHERE rc.request_id = r.id);

-- Attach existing request receipts to the backfilled charge when there is exactly one.
UPDATE receipts rc
JOIN request_charges ch ON ch.request_id = rc.request_id AND ch.sort_order = 0
SET rc.charge_id = ch.id
WHERE rc.receipt_type = 'request'
  AND rc.charge_id IS NULL
  AND (SELECT COUNT(*) FROM request_charges x WHERE x.request_id = rc.request_id) = 1;
