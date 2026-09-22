# ChangeSnap

A zero-dependency Node.js web app for creating and signing contractor change orders.

## Run

```bash
SESSION_SECRET='replace-with-a-long-random-secret' npm start
```

Open http://localhost:8780. Persistent data is stored in `data/db.json`; signed approvals are also appended to the hash-chained `data/approval-ledger.jsonl`.

## Test

```bash
npm test
```

The test covers signup, authenticated change creation, a unique public customer link, signature approval, immutable record hash, duplicate-approval lock, and the payment-ready pricing endpoint.

## Before public deployment

Set `SESSION_SECRET`, use HTTPS, mount `DATA_DIR` on durable encrypted storage with backups, configure an approved payment provider in `/api/checkout`, and add transactional email/SMS only after channel approval. The app deliberately does not contact customers itself.

See `LAUNCH.md` for the verified Render + Neon + Lemon Squeezy launch route and owner-only gates.
