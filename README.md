# PAMOJA

PAMOJA is a member-facing chama app, developer console, and sponsor-report frontend.

## Backend status

This branch includes an initial PostgreSQL-backed email OTP backend. **It is not a complete replacement for the current live app yet.** Several existing member and developer screens still call APIs that have not been migrated. See [README-BACKEND-SETUP.md](README-BACKEND-SETUP.md) for database setup, environment secrets, deployment steps, implemented routes, and the pre-production checklist.

Do not deploy this branch over production until every API used by `client.js`, `developer.js`, and `shared.js` has been implemented and tested in staging. The included `schema.sql` creates fresh tables; it does not import prior records.

## Run

Requires Node.js 18+ and PostgreSQL. Configure secrets from `.env.example` in your host's secret manager, apply `schema.sql`, then run `npm install` and `npm start`.
