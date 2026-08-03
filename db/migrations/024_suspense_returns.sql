-- Partial cash returns against open suspense advances (request stays open).

CREATE TABLE IF NOT EXISTS suspense_returns (
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
