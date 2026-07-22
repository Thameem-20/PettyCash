-- Add optional supporting image for top-up requests.
ALTER TABLE top_up_requests
  ADD COLUMN attachment_url VARCHAR(400) NULL AFTER reason,
  ADD COLUMN attachment_name VARCHAR(255) NULL AFTER attachment_url,
  ADD COLUMN attachment_mime VARCHAR(120) NULL AFTER attachment_name;
