-- Add Zybo voucher code fields to petty_cash_requests (run on existing databases).
ALTER TABLE petty_cash_requests
  ADD COLUMN zybo_voucher_suffix VARCHAR(40) NULL AFTER closed_at,
  ADD COLUMN zybo_voucher_code VARCHAR(40) NULL AFTER zybo_voucher_suffix,
  ADD COLUMN zybo_voucher_at DATETIME NULL AFTER zybo_voucher_code,
  ADD INDEX idx_req_zybo_voucher (zybo_voucher_code);
