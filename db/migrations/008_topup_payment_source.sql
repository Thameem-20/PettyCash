-- Payment source for top-up requests: cash | bank_account
ALTER TABLE top_up_requests
  ADD COLUMN payment_source VARCHAR(20) NOT NULL DEFAULT 'cash' AFTER cp_number;
