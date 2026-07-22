-- Admin-managed Compassion presets (truck / trailer / description).
CREATE TABLE IF NOT EXISTS compassion_presets (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  kind       ENUM('truck','trailer','description') NOT NULL,
  value      VARCHAR(180) NOT NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_compassion_preset (kind, value),
  INDEX idx_compassion_preset_kind (kind, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
