# Atlas Commerce Lab

Atlas Commerce Lab is a production-style teaching monorepo that combines three realistic product surfaces in one application:

1. a modern ecommerce storefront on `/`
2. a real payment checkout flow on `/checkout`
3. a local Ollama-powered AI concierge on `/chat`

The stack uses:

- `frontend`: React + Vite
- `backend`: NestJS API gateway
- `database`: MongoDB via Mongoose (Atlas-ready, local Mongo included for zero-config Docker runs)
- `ai-service`: FastAPI service that talks to local Ollama
- `payments`: real Stripe Checkout and real eSewa ePay orchestration through the NestJS backend
- `docker-compose`: local orchestration

The goal is to show how a real SaaS can combine commerce, backend orchestration, AI capabilities, and payment providers inside one clean architecture.

## What this project demonstrates

- route-based React application design with a shared product shell
- NestJS as the orchestration layer between browser, MongoDB, AI services, and payment providers
- MongoDB catalog and order modeling with Mongoose
- MongoDB Atlas-ready configuration through environment variables
- local-LLM integration through Ollama
- streaming chat UX with token and timing metadata
- server-priced checkout with provider-specific payment flows
- production-style containerization and service boundaries

## Product experience

### `/`

The home route is a premium ecommerce storefront with:

- hero merchandising section
- category filters
- Mongo-backed product catalog
- product detail pages
- persistent cart drawer
- light and dark theme support
- a clear path into checkout

### `/checkout`

The checkout route demonstrates a production-shaped payment layer with:

- server-priced carts instead of trusting browser totals
- customer contact capture before redirecting to providers
- Stripe Checkout hosted payment redirect
- eSewa ePay signed form redirect
- post-payment order result reconciliation
- one internal order model shared across multiple providers

### `/chat`

The chat route preserves the local-model experience with:

- model picker sourced from local Ollama
- conversation history
- streamed token-by-token responses
- code blocks rendered like an editor with copy actions
- usage and timing metadata

## Architecture diagram

```text
┌────────────────────────────────────────────────────────────────────┐
│                      React Frontend (Vite)                        │
│ Routes: `/`, `/products/:slug`, `/checkout`, `/chat`             │
│ UX: storefront, cart, payment selection, streamed assistant      │
└───────────────┬──────────────────────┬──────────────────┬─────────┘
                │                      │                  │
                │ /catalog/*           │ /payments/*      │ /ai/*
                ▼                      ▼                  ▼
┌──────────────────────────┐ ┌──────────────────────────┐ ┌──────────────────────────┐
│   NestJS Catalog Module  │ │  NestJS Payments Module │ │    NestJS AI Gateway     │
│ Mongo-backed store APIs  │ │ Orders + provider logic │ │ FastAPI orchestration    │
└──────────────┬───────────┘ └──────────────┬───────────┘ └──────────────┬───────────┘
               │                            │                            │
               ▼                            │                            ▼
┌──────────────────────────┐                │                ┌──────────────────────────┐
│ MongoDB / MongoDB Atlas  │                │                │ FastAPI AI Service       │
│ Products + checkout data │                │                │ Talks to local Ollama    │
└──────────────────────────┘                │                └──────────────┬───────────┘
                                            │                               ▼
                                            ▼                  ┌──────────────────────────┐
                         ┌───────────────────────────────┐      │ Ollama running locally  │
                         │ Stripe Checkout + eSewa ePay │      │ Installed local models  │
                         │ Hosted and signed pay flows   │      └──────────────────────────┘
                         └───────────────────────────────┘
```

## Folder structure

```text
.
├── frontend/
│   ├── src/app/                     # App shell, routing, global CSS
│   ├── src/core/api/                # HTTP clients for AI, catalog, and payment APIs
│   ├── src/core/types/              # Frontend API contracts
│   ├── src/features/chat/           # `/chat` experience
│   ├── src/features/store/          # Storefront, cart, checkout, order result UI
│   ├── src/features/models/         # Local model sidebar
│   ├── src/shared/                  # Theme + shared UI utilities
│   └── nginx.conf                   # SPA serving + API proxy config
├── backend/
│   ├── src/ai/                      # AI gateway routes and services
│   ├── src/catalog/                 # Mongo-backed ecommerce module
│   │   ├── data/                    # Seed catalog + marketing content
│   │   ├── dto/                     # Query validation contracts
│   │   ├── interfaces/              # Stable response contracts
│   │   └── schemas/                 # Mongoose models
│   ├── src/payments/                # Checkout, orders, Stripe, eSewa
│   │   ├── dto/                     # Request validation contracts
│   │   ├── enums/                   # Internal payment state definitions
│   │   ├── interfaces/              # Stable payment response contracts
│   │   └── schemas/                 # Order persistence model
│   └── src/common/                  # Shared backend filters/interfaces
├── ai-service/
│   └── app/                         # FastAPI AI engine + Ollama client
├── docker-compose.yml               # Full local stack orchestration
├── .env.example                     # Atlas + Ollama + payment environment template
└── README.md                        # This guide
```

## Why the backend is the orchestration layer

The browser does **not** talk directly to MongoDB, Ollama, Stripe, or eSewa.

That separation is intentional and mirrors production systems:

- the backend validates requests
- the backend owns database access rules
- the backend hides internal service topology
- the backend performs server-trusted pricing before payment
- the backend verifies provider callbacks before mutating order state
- the backend is the right home for auth, rate limiting, audit logs, and billing later

This is why the architecture stays maintainable as the app grows.

## Catalog API overview

### `GET /catalog/home`

Returns the full storefront landing payload:

- announcement banner
- hero copy and stats
- categories
- featured products
- new arrivals
- catalog products
- value props
- testimonials

### `GET /catalog/categories`

Returns category summaries with product counts.

### `GET /catalog/products`

Query parameters:

- `category`
- `search`
- `featured`
- `limit`

Example:

```bash
curl "http://localhost:3000/catalog/products?category=audio&limit=4"
```

### `GET /catalog/products/:slug`

Returns:

- a single product detail payload
- related products from the same category

## Payments API overview

The payment module intentionally keeps provider complexity behind the backend.
The browser never calculates the authoritative payable total and never talks to
Stripe or eSewa directly without a server-generated payload.

### `POST /payments/quote`

Re-prices the cart on the server and returns provider-specific totals.

Why this exists:

- product prices may have changed since the page loaded
- stock may no longer be available
- different providers can have different currencies and fee rules
- server-side pricing is a core payment security practice

Example request:

```json
{
  "items": [
    { "productId": "6629f2f44ed14d449e0cc101", "quantity": 1 },
    { "productId": "6629f2f44ed14d449e0cc102", "quantity": 2 }
  ]
}
```

### `POST /payments/stripe/checkout-session`

Creates a real Stripe Checkout Session and returns a hosted redirect URL.

Important design choices:

- an order snapshot is persisted before redirecting
- `client_reference_id` and `metadata.orderNumber` link Stripe events back to our order
- the backend verifies payment completion with signed Stripe webhooks
- the frontend success page still re-checks session status for a resilient UX

Example response:

```json
{
  "orderNumber": "ACL-260425-4AF19C",
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_..."
}
```

### `POST /payments/stripe/webhook`

Receives Stripe webhook events and verifies the `Stripe-Signature` header against
the exact raw request body before mutating order state.

Handled events include:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

### `GET /payments/stripe/session-status`

Reconciles the hosted Stripe session on the return page so the frontend can
show a trustworthy status even if the webhook arrives slightly later.

### `POST /payments/esewa/initiate`

Creates a merchant-signed eSewa redirect payload and returns:

- the eSewa form action URL
- the HTTP method
- all fields required for the hidden POST form

The backend signs:

- `total_amount`
- `transaction_uuid`
- `product_code`

### `GET /payments/esewa/success`

Handles the browser return from eSewa, verifies the encoded callback payload,
then calls eSewa's transaction status API before marking the order as paid.

### `GET /payments/esewa/failure`

Marks the order as canceled or failed when the customer abandons the eSewa flow.

### `GET /payments/orders/:orderNumber`

Returns the normalized internal order snapshot used by the checkout result page.

## AI API overview

### `GET /ai/models`

Lists models discovered from local Ollama.

### `POST /ai/generate`

One-shot AI generation.

### `POST /ai/generate/stream`

Streaming NDJSON chat endpoint used by the `/chat` page.

Example stream shape:

```json
{"type":"start","requestId":"...","provider":"ollama-local","model":"deepseek-coder:6.7b","generatedAt":"2026-04-25T12:34:56.000Z"}
{"type":"delta","requestId":"...","delta":"Here is how I would design the service..."}
{"type":"done","requestId":"...","provider":"ollama-local","model":"deepseek-coder:6.7b","generatedAt":"2026-04-25T12:35:18.000Z","usage":{"inputTokens":62,"outputTokens":250,"totalTokens":312},"timings":{"totalDurationMs":21969,"loadDurationMs":4271,"promptEvalDurationMs":1383,"completionDurationMs":15395},"doneReason":"stop"}
```

## MongoDB Atlas configuration

This repository supports **both**:

- local Mongo through Docker Compose
- MongoDB Atlas through `MONGODB_URI`

### Local Docker default

If you do nothing, the backend uses the `mongo` container from `docker-compose.yml`.

### Atlas setup

1. Copy `.env.example` to `.env`
2. Set `MONGODB_URI` to your Atlas connection string
3. Optionally keep `MONGODB_DB_NAME=ai_commerce_platform`
4. Run `docker compose up --build`

Example Atlas URI:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority&appName=atlas-commerce-lab
```

## Payment provider setup

### Stripe

1. Create a Stripe account and get a test secret key
2. Copy `.env.example` to `.env`
3. Set:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_PUBLIC_URL=http://localhost:8080
BACKEND_PUBLIC_URL=http://localhost:3000
```

4. Start local webhook forwarding in another terminal:

```bash
stripe listen --forward-to http://localhost:3000/payments/stripe/webhook
```

Why webhook forwarding matters:

- Stripe's servers cannot call your localhost directly
- the return page is not enough to treat an order as paid
- the signed webhook is the server-trusted payment confirmation

### eSewa

1. Keep the UAT defaults for sandbox testing, or replace them with your merchant credentials
2. Confirm your values in `.env`

```env
ESEWA_PRODUCT_CODE=EPAYTEST
ESEWA_SECRET_KEY=8gBm/:&EnhH.1/q(
ESEWA_FORM_URL=https://rc-epay.esewa.com.np/api/epay/main/v2/form
ESEWA_STATUS_CHECK_URL=https://rc.esewa.com.np/api/epay/transaction/status/
```

3. Start the stack and complete payment from the browser

Why eSewa is handled differently:

- eSewa uses a signed form POST instead of a Stripe-style hosted API session
- the success redirect includes an encoded payload that must be verified
- the backend still performs a server-side status check before confirming the order

## Running with Docker

### Prerequisites

- Docker Desktop or Docker Engine with Compose support
- Ollama installed locally
- Stripe CLI if you want local Stripe webhook forwarding
- at least one Ollama model, for example:

```bash
ollama pull deepseek-coder:6.7b
```

### Start the full stack

```bash
docker compose up --build
```

### Open the app

- Frontend: `http://localhost:8080`
- Store API root health: `http://localhost:3000/health`
- AI service health: `http://localhost:8000/health`

### Stop the stack

```bash
docker compose down
```

### Notes

- The frontend container proxies `/catalog`, `/payments`, and `/ai` to the NestJS backend.
- The backend uses local Mongo by default, unless `MONGODB_URI` is provided.
- The AI service uses `host.docker.internal` to reach local Ollama on macOS and Windows.
- On Linux, you may need to override `OLLAMA_BASE_URL`.
- Stripe webhook delivery to localhost usually requires `stripe listen` or a tunnel.
- eSewa browser redirects can work locally as long as `BACKEND_PUBLIC_URL` resolves from your browser.

## Local development without Docker

### 1. Start MongoDB

Use either:

- your local Mongo server
- MongoDB Atlas
- a local Docker Mongo container

Example local Mongo container:

```bash
docker run --name atlas-commerce-mongo -p 27017:27017 mongo:7
```

### 2. Start the AI service

```bash
cd ai-service
pip install -r requirements.txt
export OLLAMA_MODEL=deepseek-coder:6.7b
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Start the backend

```bash
cd backend
npm install
MONGODB_URI=mongodb://localhost:27017 \
MONGODB_DB_NAME=ai_commerce_platform \
AI_SERVICE_URL=http://localhost:8000 \
FRONTEND_PUBLIC_URL=http://localhost:5173 \
BACKEND_PUBLIC_URL=http://localhost:3000 \
npm run start:dev
```

If using Atlas:

```bash
cd backend
MONGODB_URI="mongodb+srv://..." \
MONGODB_DB_NAME=ai_commerce_platform \
AI_SERVICE_URL=http://localhost:8000 \
FRONTEND_PUBLIC_URL=http://localhost:5173 \
BACKEND_PUBLIC_URL=http://localhost:3000 \
npm run start:dev
```

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173`.

### 5. Optional: start Stripe webhook forwarding

```bash
stripe listen --forward-to http://localhost:3000/payments/stripe/webhook
```

## Validation commands

These are the most useful checks while iterating:

```bash
cd frontend && npm run build
cd backend && npm run build
cd ai-service && python3 -m py_compile app/main.py app/api/routes/generate.py app/services/ollama_client.py
```

## Production-style reasoning behind the design

### Frontend

- React Router separates the storefront, checkout, and AI workspace cleanly.
- Cart state is kept in a context with local persistence so the checkout route can rehydrate after navigation.
- The chat view streams incremental AI tokens for a more realistic assistant UX.

### Backend

- NestJS exposes catalog, payments, and AI capabilities as separate modules.
- Mongoose schemas model real catalog and order data instead of loose JSON blobs.
- Seed data gives first-run environments useful content immediately.

### Payments

- Checkout totals are computed on the server, not trusted from the browser.
- Stripe and eSewa are normalized into one internal order lifecycle.
- Stripe webhooks use raw-body signature verification before state changes.
- eSewa success handling verifies both the signed callback payload and the status API response.

### AI service

- FastAPI stays focused on AI responsibilities.
- Ollama access is isolated in a provider client.
- Streaming and one-shot responses are normalized into stable contracts.

## Learning outcomes

By studying this repository, you can learn how to:

- structure a monorepo with multiple frontend and backend services
- design route-based React applications with a shared shell
- build a Mongo-backed NestJS feature module with Mongoose
- integrate multiple payment providers behind one backend contract
- expose frontend-friendly API contracts from backend services
- integrate local Ollama models through a dedicated FastAPI layer
- stream AI responses into a polished chat UI
- containerize a multi-service app for local product development

## Future improvements

Natural next steps for a real product include:

- authentication and saved carts
- admin product management dashboard
- order history and fulfillment APIs
- refunds, partial captures, and payment reconciliation dashboards
- image uploads via object storage
- semantic search over the catalog using embeddings
- AI shopping assistant that can reference products directly
- rate limiting and usage analytics
- OpenTelemetry tracing
- Redis caching for hot catalog queries
- CDN-backed asset delivery

## Quick demo flow

1. Open `/`
2. Browse products loaded from MongoDB
3. Add items to the cart drawer
4. Continue to `/checkout`
5. choose Stripe Checkout or eSewa ePay
6. return to the order result screen and verify the recorded status
7. Open `/products/:slug` for a detail page
8. Switch to `/chat`
9. Ask the local model something like:

```text
Compare ergonomic mice for a software engineer working 10 hours a day.
```

That flow is what makes this project feel like a real integrated platform rather than an isolated demo.
