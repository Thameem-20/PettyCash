-- Per-user exception: allow Operations (and similar) to submit non-job related
-- requests. Ops are job-related only unless this flag is set.

ALTER TABLE user_approval_policy_exceptions
  ADD COLUMN allow_non_job TINYINT(1) NOT NULL DEFAULT 0 AFTER note;
