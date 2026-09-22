# Proven launch path

## Hosting and database
- Render free Node web service from `render.yaml`: public `onrender.com` URL, managed HTTPS/TLS, custom domains, no charge. Free services sleep after 15 minutes idle and have an ephemeral filesystem.
- Neon free Postgres: 0.5 GB storage, 100 CU-hours/month, 5 GB transfer, scales to zero. Set its pooled connection string as `DATABASE_URL` in Render. The app automatically switches from local JSON to Postgres.
- Render generates `SESSION_SECRET`; never commit it. Cookies are HttpOnly + SameSite=Lax. Render terminates HTTPS.
- Neon Free provides 6-hour restore history and one manual snapshot. Run `node scripts/backup.mjs backup.json` for an export with SHA-256 checksum; keep exports outside the app host.

Limits: both free tiers can cold-start or suspend at quota, so they are suitable for first revenue validation, not an uptime promise. Upgrade only after revenue.

## Payments
Recommended: Lemon Squeezy as Merchant of Record.
- Supports bank payouts to Israel and ILS customer pricing.
- One-time and recurring products supported.
- No monthly fee. Base 5% + $0.50; official fee page adds 0.5% for subscriptions and 1.5% for international transactions. On likely international card sales, a $9 one-time sale costs about $1.085 (12.1%) and a $19 monthly renewal about $1.83 (9.6%), before any other disclosed edge-case fee.
- Merchant of Record handles sales tax/VAT collection/remittance.
- Activation is owner-gated: store review, identity verification, and bank payout setup. Store review requires real product details and a working public site. Identity may require government ID; the owner must do this.
- Configure two variants after approval: $9 one-time and $19 monthly. Add API key, store/variant IDs and webhook signing secret as environment variables. Never put secrets in chat or source.

## Launch order
1. Owner creates Neon Free, copies pooled `DATABASE_URL` securely.
2. Owner creates Render Free service from repo/ZIP, sets `DATABASE_URL`; Render generates secret and HTTPS URL.
3. Add privacy, terms, refund and support pages at the live domain.
4. Owner opens Lemon Squeezy store, completes store/identity/bank verification, creates two products and supplies IDs/secrets through vault or host environment.
5. Wire checkout + signed webhooks, run sandbox payment, then owner approves live launch.

## First customer acquisition
Start with five solo residential remodelers/electricians who post recent project work and show a direct business contact. Do not pitch “software.” Offer a 10-minute observed test on one real pending change order, with the first three approvals free. Ask only: did it get signed faster, and would $9 per approved change be cheaper than losing one extra? Use results to fix onboarding before scaling to 20 prospects. No outreach happens until exact recipients and wording are approved.
