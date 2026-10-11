# Atlas Commerce Lab: UI redesign brief for the coding agent

## 1. Goal
Redesign the frontend (`frontend/`) in an Airbnb-style look. Change the presentation layer only. Keep all APIs, routes, auth, payments and AI streaming logic working.

**Visual source of truth:** `docs/design/atlas-app.html` (open it in a browser and read its CSS and markup). If this brief and the HTML disagree, the HTML wins for looks and this brief wins for behaviour.

## 2. Project context
- Frontend: React 18, TypeScript, Vite, Tailwind, React Router v6, Context API (`AuthContext`, `CartContext`), Lucide icons, SSE streaming chat, React Markdown.
- Backend: NestJS gateway (Mongo for catalog, users, orders, threads; Postgres + pgvector for PDF RAG). Stripe and eSewa payments. Google OAuth + JWT.
- AI service: FastAPI. Providers: Ollama (llama3, deepseek-coder:6.7b), OpenAI, Anthropic, Gemini. Redis/RQ workers, Qdrant.
- Existing frontend folders to reuse: `features/store`, `features/chat`, `features/models`, `features/pdf-rag`, `features/admin`, `shared/`.

## 3. Information architecture (decided)
| Area | Audience | Place in UI |
|---|---|---|
| Shop (catalog grid) | Shoppers | Home `/`. Logo links here. |
| AI concierge | Shoppers | Docked right panel (desktop, pushes the grid), bottom sheet (mobile). Opened by a bottom-right button. |
| AI Studio (code/architecture chat) | Power users | Route `/chat`. Linked only from the profile menu, not the main header. |
| PDF RAG | Power users | Merged into AI Studio as a "Documents" section in its sidebar. Remove the standalone `/pdf-rag` page and nav item (keep a redirect to `/chat`). |
| Cart + checkout | Shoppers | Right slide-in drawer. Stripe or eSewa choice. |

Header: logo, one wide search pill, Cart button with count, profile menu (AI Studio, Chat with documents, Sign out), theme toggle. On mobile the search pill moves to its own row.

## 4. Design tokens
- Brand `#ff385c` (hover `#e31c5f`), ink `#222`, muted `#6a6a6a`, border `#e6e6e6`, soft surface `#f7f7f7`, white bg.
- Dark: bg `#121212`, ink `#f2f2f2`, muted `#a3a3a3`, border `#2e2e2e`, soft `#1e1e1e`.
- Font: Figtree (400/500/600/700) with system fallback.
- Cards: image ratio 20/19, radius 14px, grid `repeat(auto-fill, minmax(250px, 1fr))`, gap 32px 24px.
- Fully rounded pills for header, chips and buttons. Primary button uses brand colour.
- Put tokens in CSS variables or the Tailwind theme. Support light, dark and system.

## 5. Components to build (map to folders)
| Component | Folder | Notes |
|---|---|---|
| `AppHeader`, `ProfileMenu`, `ThemeToggle` | `shared/` | Replace `AppChrome`. |
| `CategoryStrip`, `SortButton` | `features/store` | Icon + label tabs, `aria-pressed`. Use Lucide icons instead of emoji. |
| `ProductGrid`, `ProductCard`, `SkeletonCard` | `features/store` | Heart (wishlist), favourite badge, rating, price, hover "Add to cart". |
| `CatalogErrorBanner`, `EmptyState` | `features/store` | Retry button. Empty state offers "Ask the AI concierge". |
| `CartDrawer` | `features/store` | Quantity controls, payment method radio, total, pay button. Keep `CartContext`. |
| `ConciergePanel`, `ConciergeLauncher` | `features/chat` | Docked on screens 1100px and wider, bottom sheet under 700px. Shows context line (category, cart count, model). Suggested prompts. Product mini-cards with an Add button inside answers. |
| `StudioPage`, `ThreadList`, `ChatWindow`, `ChatComposer` | `features/chat` | Reuse `useAiAssistant`, `MarkdownRenderer`. |
| `ModelSelect` | `features/models` | Grouped: Local (Ollama) and Cloud (GPT-4o, Claude, Gemini). |
| `DocumentsPanel` | `features/pdf-rag` | Upload, chunking and embedding progress, ready state. |

## 6. Behaviour
- The concierge sends the current context with each message: selected category, cart item ids, search query, selected model. Product suggestions come from the AI service tool-use results (query catalog tool), rendered as mini-cards.
- In Studio, when at least one document is embedded, questions are answered with RAG and show source chips like `file.pdf · p. 4`. Otherwise it is a normal chat.
- Stream replies over SSE. Show them token by token.
- Search and category filter use the real catalog API (debounced search). Sort: Featured, price low-high, price high-low, top rated.
- Checkout: Stripe creates a hosted Checkout session and redirects. eSewa uses the existing signed-form flow. Do not change payment logic.
- Escape closes drawers. Scrim only for overlay drawers (cart, concierge on small screens).

## 7. Replace the mocks in the HTML prototype
| Prototype | Real source |
|---|---|
| `API` constant and `DEMO` array | `core/api/catalogApi` and real product images |
| `reply()` function | `core/api/aiApi` streaming (`useAiAssistant`) |
| Fake document progress | PDF RAG upload endpoint and job status |
| "Redirecting to Stripe/eSewa" toast | `paymentApi` checkout calls |
| Emoji icons and thumbnails | Lucide icons and product image URLs |
| "Sign out (demo)" | `AuthContext.logout` |

## 8. Do not change
Backend, API contracts, route guards, auth flow, admin area (restyle later), tests, Docker/Nginx setup. Do not add new dependencies without asking (Tailwind and Lucide are enough).

## 9. Quality bar
- Responsive from 360px up. No sideways scrolling of the page.
- Visible keyboard focus, `aria-pressed` on toggles, labels on icon buttons, dialogs trap focus.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Loading skeletons, error and empty states for catalog, chat and documents.

## 10. Order of work (stop after each step and show a short summary)
1. Plan: list the files you will add or change. Wait for approval.
2. Tokens, fonts, theme, `AppHeader`.
3. Storefront: category strip, grid, card, states.
4. Cart drawer and checkout choice.
5. Concierge panel wired to the real AI endpoint.
6. Studio page with Documents panel. Redirect `/pdf-rag` to `/chat`.
7. Tests, lint, type-check. Fix anything the redesign broke.

## 11. Done when
- Looks match `atlas-app.html` at desktop, tablet and mobile widths, in light and dark.
- Existing tests pass. Catalog, cart, checkout, chat streaming and PDF Q&A work as before.
- No leftover mock data or unused PDF RAG route.
