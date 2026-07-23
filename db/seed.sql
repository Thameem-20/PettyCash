-- =====================================================================
-- Petty Cash Management System - Seed / Master Data
-- Run AFTER schema.sql.
--
-- All demo users share the password:  Pass@123
-- (bcrypt hash below). Change passwords after first login in production.
-- =====================================================================

-- ----- Branches (each is a separate cashbox) -------------------------
INSERT INTO branches (branch_name, branch_code, currency, opening_balance, current_cash_balance, notes) VALUES
  ('Dubai',           'DXB',  'AED', 0.00, 0.00, 'Main Dubai branch'),
  ('Dubai Projects',  'DXBP', 'AED', 0.00, 0.00, 'Dubai Projects'),
  ('Abu Dhabi / AUH', 'AUH',  'AED', 0.00, 0.00, 'Abu Dhabi branch'),
  ('Compassion',      'COMP', 'AED', 0.00, 0.00, 'Compassion - handled by Fazil and Ziad'),
  ('CLI Front Office','CLI',  'AED', 0.00, 0.00, 'Office utility, admin, office-related requests');

-- ----- Users ---------------------------------------------------------
-- password for everyone: Pass@123
-- bcrypt: $2a$10$OqUJVVubfgQ6s1SL0bz5aO6H3r.BFzLeNTZWcsLwpMtCekvIFY28a
SET @pw := '$2a$10$OqUJVVubfgQ6s1SL0bz5aO6H3r.BFzLeNTZWcsLwpMtCekvIFY28a';

SET @b_dxb  := (SELECT id FROM branches WHERE branch_code='DXB');
SET @b_dxbp := (SELECT id FROM branches WHERE branch_code='DXBP');
SET @b_auh  := (SELECT id FROM branches WHERE branch_code='AUH');
SET @b_comp := (SELECT id FROM branches WHERE branch_code='COMP');
SET @b_cli  := (SELECT id FROM branches WHERE branch_code='CLI');

-- Admin
INSERT INTO users (name, email, password_hash, role, department, default_branch_id) VALUES
  ('System Admin', 'admin@company.com', @pw, 'admin', 'IT', @b_dxb);

-- Supervisor (approves requests)
INSERT INTO users (name, email, password_hash, role, department, default_branch_id) VALUES
  ('Supervisor One', 'supervisor@company.com', @pw, 'supervisor', 'Operations', @b_dxb);
SET @sup := (SELECT id FROM users WHERE email='supervisor@company.com');

-- Compassion supervisor
INSERT INTO users (name, email, password_hash, role, department, default_branch_id) VALUES
  ('Asif Iqbal', 'asif@company.com', @pw, 'supervisor', 'Compassion', @b_comp);
SET @sup_comp := (SELECT id FROM users WHERE email='asif@company.com');

-- Accounts Supervisor
INSERT INTO users (name, email, password_hash, role, department, default_branch_id) VALUES
  ('Accounts Head', 'accsup@company.com', @pw, 'accounts_supervisor', 'Accounts', @b_dxb);

-- Anees - full visibility (modelled as accounts_supervisor)
INSERT INTO users (name, email, password_hash, role, department, default_branch_id) VALUES
  ('Anees', 'anees@company.com', @pw, 'accounts_supervisor', 'Accounts', @b_dxb);

-- Treasury
INSERT INTO users (name, email, password_hash, role, department, default_branch_id) VALUES
  ('Treasury Desk', 'treasury@company.com', @pw, 'treasury', 'Finance', @b_dxb);

-- Accounts users (handlers)
INSERT INTO users (name, email, password_hash, role, department, default_branch_id) VALUES
  ('Ziad',    'ziad@company.com',    @pw, 'accounts', 'Accounts', @b_dxb),
  ('Fazil',   'fazil@company.com',   @pw, 'accounts', 'Accounts', @b_comp),
  ('Shakeel', 'shakeel@company.com', @pw, 'accounts', 'Accounts', @b_cli),
  ('Ayesha',  'ayesha@company.com',  @pw, 'accounts', 'Accounts', @b_cli);

-- Operations user
INSERT INTO users (name, email, password_hash, role, department, default_branch_id, supervisor_id) VALUES
  ('Operations One', 'ops@company.com', @pw, 'operations', 'Operations', @b_dxb, @sup);

-- Messengers / field staff
INSERT INTO users (name, email, password_hash, role, department, default_branch_id, supervisor_id) VALUES
  ('Cash Requester One', 'messenger@company.com',  @pw, 'cash_requester', 'Field', @b_dxb, @sup),
  ('Cash Requester Two', 'messenger2@company.com', @pw, 'cash_requester', 'Field', @b_comp, @sup_comp);

-- ----- Accounts user -> branch access --------------------------------
SET @u_ziad    := (SELECT id FROM users WHERE email='ziad@company.com');
SET @u_fazil   := (SELECT id FROM users WHERE email='fazil@company.com');
SET @u_shakeel := (SELECT id FROM users WHERE email='shakeel@company.com');
SET @u_ayesha  := (SELECT id FROM users WHERE email='ayesha@company.com');

-- Ziad: Dubai, Dubai Projects, Abu Dhabi, Compassion
INSERT INTO user_branch_access (user_id, branch_id, access_type) VALUES
  (@u_ziad, @b_dxb,  'handler'),
  (@u_ziad, @b_dxbp, 'handler'),
  (@u_ziad, @b_auh,  'handler'),
  (@u_ziad, @b_comp, 'handler');

-- Fazil: Compassion
INSERT INTO user_branch_access (user_id, branch_id, access_type) VALUES
  (@u_fazil, @b_comp, 'handler');

-- Shakeel & Ayesha: CLI Front Office
INSERT INTO user_branch_access (user_id, branch_id, access_type) VALUES
  (@u_shakeel, @b_cli, 'handler'),
  (@u_ayesha,  @b_cli, 'handler');

-- ----- Job code mapping ---------------------------------------------
INSERT INTO job_code_mapping (job_code, branch_id, description) VALUES
  ('101', @b_dxb,  'Dubai'),
  ('102', @b_dxbp, 'Dubai Projects');
-- AUH/Abu Dhabi job code can be added later by Admin.

-- ----- Expense categories -------------------------------------------
-- Job related (job number required)
INSERT INTO expense_categories (category_name, charge_type, job_number_required) VALUES
  ('Labour Charges',      'job', 1),
  ('Mecric Charges',      'job', 1),
  ('Exit / Entry Charges','job', 1),
  ('IMCO Sticker',        'job', 1);

-- Non job related (no job number)
INSERT INTO expense_categories (category_name, charge_type, job_number_required) VALUES
  ('Fuel Expense',     'non_job', 0),
  ('Mobile Expense',   'non_job', 0),
  ('Car Wash Expense', 'non_job', 0);

-- Compassion charge types
INSERT INTO expense_categories (category_name, charge_type, job_number_required) VALUES
  ('Truck / Trailer Charges', 'truck_trailer', 0),
  ('General Compassion Charges', 'general', 0);

INSERT INTO compassion_drivers (name) VALUES
  ('Driver One'),
  ('Driver Two');

INSERT INTO compassion_presets (kind, value) VALUES
  ('truck', 'T-101'),
  ('truck', 'T-102'),
  ('trailer', 'TR-55'),
  ('trailer', 'TR-56'),
  ('description', 'Toll charges'),
  ('description', 'Diesel');

-- ----- Opening balance ledger entries (one per branch) ---------------
SET @u_admin := (SELECT id FROM users WHERE email='admin@company.com');

INSERT INTO cash_ledger (branch_id, transaction_type, debit_amount, credit_amount, running_balance, created_by_user_id, remarks)
SELECT id, 'adjustment', 0.00, opening_balance, opening_balance, @u_admin, 'Opening balance'
FROM branches;
