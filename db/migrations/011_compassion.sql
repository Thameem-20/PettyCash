-- Compassion branch: drivers + truck/trailer fields + charge types.

CREATE TABLE IF NOT EXISTS compassion_drivers (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_compassion_driver_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE expense_categories
  MODIFY COLUMN charge_type ENUM('job','non_job','truck_trailer','general') NOT NULL;

ALTER TABLE petty_cash_requests
  MODIFY COLUMN charge_type ENUM('job','non_job','truck_trailer','general') NOT NULL;

ALTER TABLE request_charges
  ADD COLUMN truck_number VARCHAR(80) NULL AFTER job_number,
  ADD COLUMN trailer_number VARCHAR(80) NULL AFTER truck_number,
  ADD COLUMN driver_id INT NULL AFTER trailer_number,
  ADD CONSTRAINT fk_rc_driver FOREIGN KEY (driver_id) REFERENCES compassion_drivers(id) ON DELETE SET NULL,
  ADD INDEX idx_rc_truck (truck_number),
  ADD INDEX idx_rc_trailer (trailer_number);

-- Seed Compassion charge categories (ignore if already present).
INSERT IGNORE INTO expense_categories (category_name, charge_type, job_number_required)
VALUES
  ('Truck / Trailer Charges', 'truck_trailer', 0),
  ('General Compassion Charges', 'general', 0);
