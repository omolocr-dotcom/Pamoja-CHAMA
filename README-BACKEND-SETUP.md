# PAMOJA backend foundation — deployment guide

This package preserves the current PAMOJA website and adds the first production-oriented backend foundation: PostgreSQL schema, email OTP sign-in, expiring server-side sessions, developer allow-list checks, basic `/api/me` and group endpoints, security headers, and health checks.

**Important: this is not yet a complete migration of all PAMOJA features.** The current frontend calls many routes for contributions/payments, loans, notices, members, meetings, reports, ads, shares, messages, and other modules. Those APIs must be implemented and tested against the current UI before this version can replace the live site. Unmigrated API calls deliberately return HTTP 501 rather than fake successful data. Keep production on the current release until the feature checklist below is complete.

## 1. Protect the existing deployment

1. In GitHub, create a branch such as `feature/email-otp-backend` and commit the current version first.
2. Download/retain the current Chajio release so rollback is possible.
3. Do not paste secrets into GitHub files, issues, or chat.

## 2. Create PostgreSQL

Create a managed PostgreSQL database with TLS enabled. Run `schema.sql` against it using the provider's SQL console or `psql "$DATABASE_URL" -f schema.sql`. Backups/PITR should be enabled before real financial records are entered.

The schema creates users, OTP challenges, sessions, groups, group membership, transactions, loans, notices, and an audit log. It does not import old records.

## 3. Set environment secrets in Chajio

Use `.env.example` as a checklist, but configure values in Chajio's environment/secrets UI. Required:

- `DATABASE_URL`: PostgreSQL connection string with TLS.
- `SESSION_SECRET`: independently generated random secret, 32+ characters.
- `OTP_PEPPER`: another independently generated random secret, 32+ characters.
- `SMTP_HOST=cloud2310.liveboxserver.uk`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `SMTP_USER=login@wavehub.co.ke`
- `SMTP_PASS`: the existing secret already saved in Chajio.
- `EMAIL_FROM=login@wavehub.co.ke`
- `DEV_ADMIN_EMAILS`: comma-separated exact email address(es) permitted to use developer features.
- `NODE_ENV=production`

Use a strong unique secret generator for the two random values. Do not use the SMTP password as either secret. Restrict the developer allow-list to addresses you control. Existing user records with the allow-listed email are promoted to developer on successful OTP flow; never let a public registration form choose its own role.

If the database provider requires a custom CA certificate, configure the provider-supported TLS settings; do not disable certificate validation just to make a connection work.

## 4. Deploy on a staging app first

1. Upload/commit the files in this package to the feature branch (including `schema.sql`).
2. Confirm the Chajio runtime uses Node.js 18+ and runs `npm install` followed by `npm start`.
3. Apply `schema.sql` to the database before starting the server.
4. Configure all environment values in Chajio.
5. Verify `/health` reports `{"ok":true,"app":"PAMOJA API","database":"connected"}`.
6. Test email delivery with an address you control. Verify wrong codes, expired codes, repeated requests, and session logout.
7. Do not promote this build to production until the feature routes in the checklist below are implemented.

## 5. Current API status

Implemented in this foundation:

- `POST /api/auth/request-otp` — email OTP, 6 digits, 5-minute expiry, request limits.
- `POST /api/auth/verify` — attempt limits, single-use code, server-backed 7-day session.
- `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/groups` and `POST /api/groups`
- `GET /api/dev/groups` and `GET /api/dev/inbox` (empty inbox until messages are migrated)
- `GET /health`

Still needs implementation and end-to-end tests against `client.js` and `developer.js`:

- member invitations, member listing/import/roles/removal
- group finance summaries, contributions/payments, receipts, expenses, projects, welfare/funerals
- loan applications, approvals, repayments, caps
- notices, meetings/check-ins, minutes, consent, audit/developer line
- developer ads, group messaging/broadcast, report generation/requests/shares
- shared report links and sponsor pages
- all remaining group-scoped API routes and authorization rules

For financial functionality, add transaction-safe writes, immutable audit records, role checks (leader/treasurer/member), idempotency for payment callbacks, and reconciliation before using real money.

## 6. Pre-production security checklist

- [ ] Confirm backup and restore procedure for PostgreSQL.
- [ ] Confirm the live frontend has not been changed until staging tests pass.
- [ ] Verify email OTP delivery and expiry using real SMTP.
- [ ] Verify a non-allow-listed account cannot call `/api/dev/*` successfully.
- [ ] Verify all group data routes enforce group membership server-side.
- [ ] Verify financial writes use database transactions and audit trails.
- [ ] Implement every route called by `client.js`, `developer.js`, and `shared.js`.
- [ ] Review retention, consent, and Kenya data-protection obligations before onboarding members.
