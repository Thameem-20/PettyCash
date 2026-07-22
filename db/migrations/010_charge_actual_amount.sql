-- Per-charge actual expense for suspense settlement.
ALTER TABLE request_charges
  ADD COLUMN actual_amount DECIMAL(12,2) NULL AFTER amount;
