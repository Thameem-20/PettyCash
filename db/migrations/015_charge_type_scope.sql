-- Control Panel: allowed charge types per branch + suspense restrictions per role.

ALTER TABLE branch_profiles
  ADD COLUMN charge_type_scope ENUM('job_and_non_job','job_only','non_job_only')
    NOT NULL DEFAULT 'job_and_non_job' AFTER allow_suspense;

ALTER TABLE branch_approval_policies
  ADD COLUMN suspense_charge_scope ENUM('inherit','job_and_non_job','job_only','non_job_only')
    NOT NULL DEFAULT 'inherit' AFTER approval_path;

-- CLI: non-job related only (as requested).
UPDATE branch_profiles bp
  JOIN branches b ON b.id = bp.branch_id
   SET bp.charge_type_scope = 'non_job_only'
 WHERE b.branch_code = 'CLI';

-- Messenger / Operations: suspense advances are non-job only by default.
UPDATE branch_approval_policies
   SET suspense_charge_scope = 'non_job_only'
 WHERE submitter_role IN ('messenger', 'operations')
   AND suspense_charge_scope = 'inherit';
