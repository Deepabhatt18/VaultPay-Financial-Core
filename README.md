# VaultPay Financial Core – Track A (Frontend)

Secure role-based billing portal UI for **Nexus Corporate Services** (client: Evelyn Croft, CFO).
Built with **Next.js 15 (App Router) · React 19 · TypeScript**.

The frontend contains **no business logic or secrets**. It talks to a backend API (`API_URL`).
A small **mock backend** is bundled in `mock-backend/` only so the UI can be demonstrated end-to-end;
replace it with the real backend by changing `API_URL`.

## Requirements → implementation

| Requirement | Where |
|---|---|
| **R1** Two roles `Admin` / `Client` | Role comes from the backend (`GET /api/auth/me`); UI/nav differ per role (`components/AppHeader.tsx`) |
| Admin: master dashboard, create invoices, total revenue | `src/app/admin/dashboard`, `src/app/admin/invoices/new`, `src/app/admin/clients/new` |
| Client: only own billing history & outstanding | `src/app/dashboard` (data is already filtered by the backend) |
| **Security guard**: Client typing `/admin/dashboard` → **403** | `src/middleware.ts` (redirect to `/403` before any page renders) + `requireUser('ADMIN')` in every admin page + `src/app/403` |
| **R2** Stripe Checkout, idiot-proof Pay button | `components/PayButton.tsx`: disabled + spinner immediately, synchronous `useRef` lock so a double-click can never send two requests; backend returns the Stripe Checkout URL and the browser is redirected |
| **R3** Document Vault: invoice detail + "Download PDF" | `src/app/invoices/[id]/page.tsx`, `components/DownloadButton.tsx` (fetches PDF as a blob → native browser download) |

### The Pay button (why double-clicks cannot double-charge)
1. A `useRef` lock flips **synchronously** on the first click, before React re-renders, so a 2nd click in the same frame is ignored.
2. `disabled` + spinner + `aria-busy` are applied immediately; label changes to "Redirecting to secure checkout…".
3. The button stays locked after success until the browser has navigated to Stripe; it re-arms only on error/timeout (25 s) or when the user returns with the Back button (bfcache `pageshow`).
4. Defence in depth: the backend is idempotent (same invoice → same Checkout Session), so even a forced duplicate request cannot create a second charge.
5. After Stripe redirects back, the UI never trusts `?checkout=success`; it asks the backend to verify (`CheckoutReturn.tsx`).

### Route guards (two layers in the frontend)
1. `src/middleware.ts` calls `GET /api/auth/me` with the visitor's cookie. No session → `/login`; `CLIENT` on `/admin/**` → `/403`. If the backend cannot be reached it **fails closed**.
2. Each server page calls `requireUser(role)` again, so bypassing the middleware still shows no data.
The real protection is the backend, which filters every query by owner; the frontend never decides who may see what.

## Quick start

Needs Node 18+ (20/22 recommended). Two terminals.

```bash
# Terminal 1 – mock backend (port 4000)
npm run backend:install
cd mock-backend && cp .env.example .env.local     # then set AUTH_SECRET (32+ random chars)
npm run dev

# Terminal 2 – frontend (port 3000), from the project root
npm install
cp .env.example .env.local                        # API_URL=http://localhost:4000
npm run dev
```
Open http://localhost:3000.

PowerShell: use `copy .env.example .env.local` instead of `cp`.

### Demo accounts
| Role | Email | Password |
|---|---|---|
| Admin | `admin@nexus-corp.example` | `Admin#Vault2026` |
| Client | `daniel@acme-industries.example` | `Client#Acme2026` |
| Client | `priya@globex-logistics.example` | `Client#Globex2026` |

There is no public sign-up by design: the Admin creates client accounts (Admin → New client).

### Payments
With no `STRIPE_SECRET_KEY` in `mock-backend/.env.local` a clearly-labelled **simulated checkout** page (`/pay/mock`) is used,
so no Stripe account is needed. For real Stripe test mode put `STRIPE_SECRET_KEY=sk_test_...` and `STRIPE_WEBHOOK_SECRET`
in `mock-backend/.env.local` (webhook: `stripe listen --forward-to localhost:4000/api/webhooks/stripe`), test card `4242 4242 4242 4242`.

## Backend API contract
The frontend expects these endpoints (session = httpOnly cookie set by login; all amounts are integer cents).
Browser calls go to the frontend origin and are proxied (`next.config.mjs` rewrites), so no CORS setup is needed.

| Method & path | Purpose | Notes |
|---|---|---|
| `POST /api/auth/login` `{email,password}` | Sign in | Sets cookie; returns `{role, redirect}` |
| `POST /api/auth/logout` | Sign out | |
| `GET /api/auth/me` | Current user | `200 {user:{id,name,email,company,role}}` or `401` |
| `GET /api/invoices` | Invoice list | Admin: all. Client: **own only** |
| `GET /api/invoices/:id` | Invoice detail | **404** if not found or not yours |
| `POST /api/invoices/:id/checkout` | Start payment | Returns `{url}` (Stripe Checkout); idempotent; `409` if already paid |
| `POST /api/invoices/:id/verify` | Confirm payment after redirect | Returns `{status}` |
| `GET /api/invoices/:id/pdf` · `/receipt` | PDF files | `Content-Disposition: attachment` |
| `GET /api/admin/overview` | Totals + per-client summary | ADMIN only (403 otherwise) |
| `GET/POST /api/admin/clients` · `POST /api/admin/invoices` | Admin actions | ADMIN only |
| `POST /api/mock/complete` | Simulated payment (mock backend only) | |

Shapes are in `src/lib/types.ts`.

## Verify
With both servers running (`npm run build && npm start` for the frontend):
```bash
npm run security-check     # 31 end-to-end checks via the frontend origin
npm run typecheck
npm run backend:seed       # reset demo data (stop/restart the backend after)
```
Covers: Client → `/admin/dashboard` → 403, forged cookies, data isolation (other client's invoice/PDF/pay → 404),
CSRF, **12 simultaneous pay clicks → exactly one Checkout Session**, PDF download, receipt.

## Structure
```
src/
  middleware.ts          route guard (auth + RBAC)
  lib/api.ts             server-side API client (forwards cookie; maps 401/403/404 to screens)
  lib/types.ts, money.ts DTOs and money formatting
  app/                   login, 403, dashboard (client), admin/*, invoices/[id], pay/mock
  components/            PayButton, DownloadButton, CheckoutReturn, InvoiceTable, AppHeader, ...
mock-backend/            demo API (Next.js route handlers) – replace with the real backend
scripts/security-check.mjs
```
