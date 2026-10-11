# Atlas Commerce Lab: Admin panel (Dashboard, Products CRUD, Users)

**Visual source of truth:** `docs/design/atlas-admin.html`. Open it in a browser and match layout, spacing, colors and states. Its data and functions are fake; replace them with real code. Same tokens as `atlas-app.html` (brand `#ff385c`, Figtree, light and dark).

## 1. Goal
When a user with role `admin` logs in, they land on an Admin panel inside the existing React app (`features/admin`). The panel has a Dashboard, a Products page with full CRUD, and a Users list. Keep it simple: no separate app, no vendor accounts.

## 2. Access
- One normal login for everyone. Do **not** add a role toggle to the login screen.
- After login: `admin` is redirected to `/admin`; everyone else goes to `/`.
- `AdminRoute` guard on `/admin/*`: allow role `admin` only, otherwise redirect to `/`.
- API: protect every admin endpoint with the existing `@Roles('admin')` guard. Never trust the client for the role.
- Load the admin routes with `React.lazy` so shoppers never download admin code.

## 3. Layout (`features/admin/AdminLayout`)
- Left sidebar, 256px, sticky. Under 860px it becomes a slide-out drawer opened by a hamburger.
- Sidebar: logo "Atlas Admin", group OVERVIEW: Dashboard. Group MANAGE: Products (count), Users (count). Footer: admin card (avatar, name, "Administrator"), "Open storefront", theme toggle, "Log out".
- Sticky top bar: hamburger (mobile), breadcrumb, avatar.
- Routes: `/admin` Dashboard, `/admin/products`, `/admin/users`.

## 4. Dashboard (`/admin`)
- 4 stat cards: total products, published products, users, revenue (last 30 days).
- Card "Sales, last 7 days": simple bar chart (use plain divs or SVG, no chart library).
- Card "New users": 4 latest users with a "View all" link.
- "Low stock" list (stock <= 5) with a Restock button that opens the edit drawer, plus "+ Add product".
- Data comes from `GET /api/admin/stats`.

## 5. Products (`/admin/products`): full CRUD
- **List table**: Product (thumbnail, name, SKU), Category, Price, Stock (amber "n left", red "Out of stock"), Status chip (Published or Draft), Actions (Edit, Delete). Filter chips with counts (All, Published, Drafts), search by name or SKU, sortable headers, pagination (server side), empty state, loading skeleton, error state.
- **Create / Edit**: a right-side drawer (480px, full width on mobile) with: Image upload with preview, Replace and Remove; Product name (3+ chars); Category; Price (> 0); Stock (>= 0); Description; Status (Published or Draft). Inline validation errors. Buttons Cancel and Create product or Save changes. Warn before closing with unsaved changes. Escape and the scrim close it.
- **Delete**: confirmation dialog ("Delete this product? It will be removed from the store. This cannot be undone."). Prefer a soft delete.
- After any change: show a toast, refresh the list, and invalidate the public catalog query so the storefront updates. Only `status: published` products are returned by the public `GET /api/products`.
- Use optimistic updates where safe, with rollback on error.

## 6. Users (`/admin/users`)
- Table: User (avatar, name, email), Role (select: Customer or Admin), Status chip (Active or Suspended), Orders (count), Joined, Action (Suspend or Reactivate).
- Filter chips: All users, Customers, Admins. Search by name or email. Pagination.
- The signed-in admin sees a "You" tag and cannot change their own role or suspend themselves (disable the controls and enforce it in the API).
- Suspended users cannot log in (check in the auth service and reject JWTs for suspended users).
- Show a toast after each change. Role changes need a confirmation if promoting someone to admin.

## 7. API (NestJS, all `@Roles('admin')`)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/stats` | Counts, revenue (30 days), sales per day (7 days), latest users, low-stock products. |
| GET | `/api/admin/products` | Query: `status, q, sort, page, pageSize`. Returns items, total, counts per status. |
| POST | `/api/admin/products` | Create. Validate with `class-validator` DTO. |
| PATCH | `/api/admin/products/:id` | Update. |
| DELETE | `/api/admin/products/:id` | Soft delete. |
| POST | `/api/admin/uploads` | Image upload, type and size checks, returns the URL. |
| GET | `/api/admin/users` | Query: `role, q, page, pageSize`. Includes order counts. Never return password hashes. |
| PATCH | `/api/admin/users/:id/role` | Body `{role}`. Reject changing your own role. |
| PATCH | `/api/admin/users/:id/status` | Body `{status: active\|suspended}`. Reject suspending yourself. |

Product fields: `title, category, price (integer cents), stock, description, imageUrl, status ('draft'|'published'), sku (auto), createdAt, updatedAt, deletedAt?`. The UI shows dollars and converts. If your catalog already has these fields, extend it instead of creating a new schema. Keep the existing public response shape.

## 8. Quality bar
- Light and dark themes, responsive from 360px, tables scroll sideways inside their own container, keyboard accessible, visible focus, labelled icon buttons, `aria-pressed` on filter chips, focus trapped in the drawer and dialog.
- Loading, empty and error states on every page.
- No new libraries beyond React Query, Zod and React Hook Form (ask first for anything else). Use Lucide icons instead of the inline icons in the prototype.
- Tests: admin guard (non-admin gets 403 and is redirected), product CRUD API, validation errors, public endpoint hides drafts and deleted products, cannot change or suspend yourself, suspended user cannot log in, component tests for the table and the product drawer.

## 9. Order of work (stop after each step and summarize)
1. Plan: files to add or change, API contract, data changes. Wait for approval.
2. Backend: admin endpoints, DTOs, guards, upload, stats, tests.
3. `AdminRoute`, `AdminLayout`, role-based redirect after login.
4. Dashboard page.
5. Products page: table, drawer, delete dialog, cache invalidation.
6. Users page.
7. Seed script (one admin, a few customers, sample products), README and `.env.example`.

## 10. Done when
- An admin logs in, lands on `/admin`, creates, edits and deletes products, and the storefront reflects changes without a deploy.
- An admin can view users, change roles and suspend accounts; non-admins cannot reach any admin page or endpoint.
- The UI matches `atlas-admin.html` in light and dark, desktop and mobile. All tests pass.
