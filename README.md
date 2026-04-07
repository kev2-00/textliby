# textliby

TextLiby is a small Express + PostgreSQL app for tracking novels and textbooks.

## Local setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` and `SESSION_SECRET`.
3. Run `npm install`.
4. Run `node server/run-migrations.js`.
5. Run `npm start`.

## Railway deploy notes

- `railway.json` tells Railway to:
  - run `node server/run-migrations.js` before each deploy
  - start the app with `node server/index.js`
  - use `/health` for health checks
- Database config can come from any of these:
  - `DATABASE_URL`
  - `DATABASE_PUBLIC_URL`
  - Railway Postgres variables: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- Set `NODE_ENV=production` on Railway so secure cookies and proxy handling are enabled.
- `SESSION_SECRET` is always required.
- Set `APP_BASE_URL` to your public app URL. On Railway, a common value is `https://${{RAILWAY_PUBLIC_DOMAIN}}`.
