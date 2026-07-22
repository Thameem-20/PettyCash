CREATE TABLE IF NOT EXISTS request_job_numbers (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  request_id  INT NOT NULL,
  job_number  VARCHAR(80) NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rjn_request FOREIGN KEY (request_id) REFERENCES petty_cash_requests(id) ON DELETE CASCADE,
  INDEX idx_rjn_request (request_id),
  INDEX idx_rjn_job_number (job_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill existing single job numbers
INSERT INTO request_job_numbers (request_id, job_number, sort_order)
SELECT id, job_number, 0
  FROM petty_cash_requests
 WHERE job_number IS NOT NULL AND TRIM(job_number) <> '';
