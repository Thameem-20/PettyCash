-- CSR number assigned when a suspense request is fully closed.
ALTER TABLE petty_cash_requests
  ADD COLUMN closed_request_no VARCHAR(40) NULL AFTER request_no,
  ADD INDEX idx_req_closed_no (closed_request_no);
