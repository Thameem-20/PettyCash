-- Fleet vehicles (cars) for fuel charges — plate + display name managed by admin.
-- Separate from Compassion truck_number.

CREATE TABLE IF NOT EXISTS fleet_vehicles (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  plate_no   VARCHAR(80) NOT NULL,
  label      VARCHAR(120) NOT NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fleet_plate (plate_no),
  INDEX idx_fleet_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE request_charges
  ADD COLUMN vehicle_number VARCHAR(80) NULL AFTER fuel_liters,
  ADD COLUMN vehicle_label VARCHAR(120) NULL AFTER vehicle_number,
  ADD INDEX idx_rc_vehicle (vehicle_number);

-- Move any fuel rows that stored plate in truck_number over to vehicle_number.
UPDATE request_charges
   SET vehicle_number = truck_number,
       truck_number = NULL
 WHERE fuel_liters IS NOT NULL
   AND truck_number IS NOT NULL
   AND TRIM(truck_number) <> ''
   AND (vehicle_number IS NULL OR TRIM(vehicle_number) = '');
