-- Compassion accounts coding: PCP number + JV (instead of Zybo VC).

ALTER TABLE petty_cash_requests
  ADD COLUMN pcp_number VARCHAR(80) NULL AFTER zybo_voucher_at,
  ADD COLUMN jv_number VARCHAR(80) NULL AFTER pcp_number,
  ADD COLUMN pcp_jv_at DATETIME NULL AFTER jv_number,
  ADD INDEX idx_req_pcp_number (pcp_number);
