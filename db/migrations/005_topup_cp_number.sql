-- CP reference number entered when requesting a top-up.
ALTER TABLE top_up_requests
  ADD COLUMN cp_number VARCHAR(80) NULL AFTER reason;
