# Petty Cash Management System

Internal petty cash workflow system for a multi-branch company. Replaces the
manual slip + Excel process with role-based requests, supervisor approvals,
branch-wise cashboxes, suspense (advance) settlement, treasury top-ups, an audit
trail, and reporting.

Built with **Next.js (App Router) + TypeScript + Tailwind CSS** and **MySQL**
using **raw SQL** via `mysql2` (no ORM). Authentication is custom (bcrypt +
JWT in an httpOnly cookie).

---

## 1. Prerequisites

- Node.js 18.18+ (or 20+)
- A MySQL 8.x database you control

## 2. Database setup

Create the database, then paste the two SQL files (schema first, then seed):

```sql
CREATE DATABASE petty_cash CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE petty_cash;
```

1. Run [`db/schema.sql`](db/schema.sql) — creates all tables, foreign keys and indexes.
2. Run [`db/seed.sql`](db/seed.sql) — loads branches, accounts handlers, job codes, categories and demo users.

> The seed creates an opening-balance ledger row per branch and demo users that
> all share the password **`Pass@123`**. Change passwords after first login.

## 3. Environment

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=petty_cash
JWT_SECRET=<a long random string>
UPLOAD_DIR=uploads
```

## 4. Install & run

```bash
npm install
npm run dev          # http://localhost:3000
# or
npm run build && npm start
```

Receipt files are written to the `UPLOAD_DIR` folder (default `uploads/`) and
served only through the authenticated route `GET /api/files/[id]`.

---

## 5. Roles & demo logins (password `Pass@123`)

| Role | Email | Can do |
|------|-------|--------|
| Admin | `admin@company.com` | Manage users, branches, categories, job codes, accounts assignments |
| Supervisor | `supervisor@company.com` | Approve / reject / return requests, edit approved amount (with reason) |
| Accounts (Ziad) | `ziad@company.com` | Pay, issue suspense, settle, top-up; branches: Dubai, Dubai Projects, AUH, Compassion |
| Accounts (Fazil) | `fazil@company.com` | Compassion |
| Accounts (Shakeel) | `shakeel@company.com` | CLI Front Office |
| Accounts (Ayesha) | `ayesha@company.com` | CLI Front Office |
| Accounts Supervisor | `accsup@company.com` | Full visibility, top-up approval, reports |
| Anees (full visibility) | `anees@company.com` | Same as Accounts Supervisor |
| Treasury | `treasury@company.com` | Approve/reject top-ups, mark cash released |
| Messenger | `messenger@company.com` | Submit requests, confirm cash, settle suspense |
| Operations | `ops@company.com` | Raise job requests, assign receiver |

## 6. Branches & handlers

| Branch | Job code | Accounts handler(s) |
|--------|----------|---------------------|
| Dubai | 101 | Ziad |
| Dubai Projects | 102 | Ziad |
| Abu Dhabi / AUH | (add in Admin) | Ziad |
| Compassion | – | Fazil, Ziad |
| CLI Front Office | – | Shakeel, Ayesha |

Each branch has its own cashbox; balances never mix.

---

## 7. Workflows

**Exact payment / reimbursement**
`Submit → Pending Supervisor Approval → Pending Payment → Paid → Awaiting Receiver Confirmation → Closed`

**Suspense / advance**
`Submit → Pending Supervisor Approval → Pending Accounts Issue → Suspense Issued → Awaiting Cash Receipt → Open Suspense → Receipt Submitted → Pending Settlement Review → Closed`
Closes only when `Advance Issued = Actual Expense + Returned Amount` (or `Advance + Additional Paid = Actual`).

**Top-up**
`Requested by Accounts → Accounts Supervisor Approval → Treasury Approval → Cash Released → Received by Accounts → Branch Balance Updated → Closed`

### Branch routing
- **Job related:** job number (e.g. `101/SIMP/26/225`) is mandatory; the first
  segment is matched against `job_code_mapping` and the branch is auto-selected
  and locked. If unmapped, submission is blocked (admin / accounts-supervisor
  override only).
- **Non job related:** branch defaults to the user's default branch but can be
  changed via dropdown; the target branch + accounts handler is shown before submit.

### Balance logic
```
Available Cash = Opening + Top-ups + Suspense Returns − Exact Payments − Suspense Advances
```
Dashboards show **Cash in Hand**, **Open Suspense**, and **Total Petty Cash Float**.

---

## 8. Controls enforced (server-side)

1. Job categories require a job number.
2. Non-job categories require branch confirmation.
3. Branch always present before submission.
4. Receipt mandatory for exact reimbursement.
5. Receipt mandatory before suspense settlement.
6. A user cannot approve their own request.
7. Accounts cannot pay unless a supervisor approved it.
8. Suspense cannot close unless the amount is settled (balanced).
9. Duplicate-payment prevention via `processing_by_user_id` lock.
10. A ledger entry is created for every cash movement.
11. Every mutation is recorded in `audit_logs`.
12. Rejected / returned requests store the reason.
13. Paid requests are not editable except by Accounts Supervisor / Admin (audited).
14. Branch balance cannot go negative unless overridden by an Accounts Supervisor.

---

## 9. Project structure

```
db/                       schema.sql, seed.sql
src/
  middleware.ts           auth gate + redirects
  lib/                    db, auth, session, rbac, routing, ledger, status,
                          requests, topup, reports, audit, files, util
  components/             Sidebar, MobileNav, tables, badges, switchers
  app/
    login/                login page
    (app)/                authenticated shell + role pages
      dashboard/ requests/ approvals/ confirm/ suspense/
      accounts/ accounts-supervisor/ treasury/ reports/ admin/
    api/                  auth, requests/*, topup/*, admin/*, meta, routing, files, reports
```
