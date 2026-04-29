# Requirements Document

## Introduction

The Admin Dashboard is a production-grade administrative interface for the Atlas Commerce Lab ecommerce platform. It provides authenticated administrators with full visibility and control over the platform's products, orders, users, inventory, and payment configuration. The feature extends the existing NestJS backend and React/Vite frontend without replacing any existing functionality.

The dashboard is accessible only to users with the `admin` role. Admin role assignment is performed out-of-band (environment seed or direct database update). All admin API endpoints are protected by a dedicated `AdminGuard`. All admin frontend routes are protected by an `AdminRoute` component that redirects non-admins to the home page.

---

## Glossary

- **Admin_Dashboard**: The full administrative interface described in this document.
- **AdminGuard**: A NestJS guard that rejects requests from non-admin JWT holders with HTTP 403.
- **AdminRoute**: A React component that redirects unauthenticated or non-admin users away from admin pages.
- **Dashboard_Overview**: The landing page of the Admin_Dashboard showing aggregate statistics and recent activity.
- **Order**: A checkout transaction stored in the `checkout_orders` MongoDB collection, with statuses: `pending_payment`, `paid`, `failed`, `canceled`, `expired`.
- **Order_Status**: One of the five values in the `OrderStatus` enum: `pending_payment`, `paid`, `failed`, `canceled`, `expired`.
- **Payment_Provider**: One of `stripe` or `esewa`.
- **Product**: A catalog item stored in the `catalog_products` MongoDB collection.
- **Provider_Config**: A MongoDB-persisted document that stores the enabled/disabled state of each Payment_Provider.
- **Role**: A string field on the User document with value `user` or `admin`.
- **Stock_History_Entry**: A record of a stock change event for a Product, including the previous count, new count, reason, and timestamp.
- **User**: A registered account stored in the `users` MongoDB collection.
- **JWT_Payload**: The decoded claims object embedded in a signed JSON Web Token issued by the auth service.

---

## Requirements

### Requirement 1: Admin Role System

**User Story:** As a platform operator, I want a role-based access control system, so that only designated administrators can access sensitive management features.

#### Acceptance Criteria

1. THE User_Schema SHALL include a `role` field with allowed values `user` and `admin`, defaulting to `user`.
2. THE User_Schema SHALL include an `isActive` field of type boolean, defaulting to `true`.
3. WHEN the JWT_Payload is generated for a user, THE Auth_Service SHALL include the user's `role` and `isActive` values in the payload.
4. WHEN a request arrives at an admin-protected endpoint, THE AdminGuard SHALL verify that the JWT_Payload contains `role === 'admin'`.
5. IF the JWT_Payload does not contain `role === 'admin'`, THEN THE AdminGuard SHALL reject the request with HTTP status 403.
6. IF the JWT_Payload belongs to a user where `isActive === false`, THEN THE AdminGuard SHALL reject the request with HTTP status 403.
7. WHEN an unauthenticated or non-admin user navigates to an admin frontend route, THE AdminRoute SHALL redirect the user to the home page (`/`).
8. WHILE the auth state is being restored from local storage, THE AdminRoute SHALL display a loading indicator and SHALL NOT redirect prematurely.
9. THE Admin_Seed_Script SHALL promote a user to admin role by reading an `ADMIN_EMAIL` environment variable and updating the matching User document's `role` field to `admin`.

---

### Requirement 2: Dashboard Overview

**User Story:** As an admin, I want a high-level overview of platform health, so that I can monitor key metrics at a glance without querying the database manually.

#### Acceptance Criteria

1. WHEN an admin loads the Dashboard_Overview, THE Dashboard_API SHALL return the total count of all User documents.
2. WHEN an admin loads the Dashboard_Overview, THE Dashboard_API SHALL return the total count of all Order documents.
3. WHEN an admin loads the Dashboard_Overview, THE Dashboard_API SHALL return the total count of all Product documents.
4. WHEN an admin loads the Dashboard_Overview, THE Dashboard_API SHALL return the sum of `pricing.total` for all Order documents where `status === 'paid'`.
5. WHEN an admin loads the Dashboard_Overview, THE Dashboard_API SHALL return daily revenue aggregates for the 30 calendar days preceding the current date, where each entry contains the date and the sum of `pricing.total` for paid orders on that date.
6. WHEN an admin loads the Dashboard_Overview, THE Dashboard_API SHALL return the 10 most recently created Order documents, each including `orderNumber`, `status`, `customer.fullName`, `customer.email`, `pricing.total`, `pricing.currency`, `paymentProvider`, and `createdAt`.
7. WHEN an admin loads the Dashboard_Overview, THE Dashboard_API SHALL return all Product documents where `inventoryCount < 5`, each including `slug`, `name`, `inventoryCount`, and `categoryName`.
8. WHEN an admin loads the Dashboard_Overview, THE Dashboard_API SHALL return the count of Order documents grouped by `status`, covering all five Order_Status values.
9. WHEN an admin loads the Dashboard_Overview, THE Dashboard_API SHALL return the total revenue grouped by `paymentProvider` for all paid orders.
10. THE Dashboard_Overview_Page SHALL render all stats cards, the revenue chart, the recent orders table, the low-stock alerts section, and the order status breakdown chart using real data from the Dashboard_API.

---

### Requirement 3: Product Management

**User Story:** As an admin, I want full CRUD control over the product catalog, so that I can keep product data accurate and up to date.

#### Acceptance Criteria

1. WHEN an admin requests the product list, THE Admin_Catalog_API SHALL return all Product documents with support for pagination using `page` and `limit` query parameters.
2. WHEN an admin provides a `search` query parameter, THE Admin_Catalog_API SHALL return only Product documents where the `name`, `subtitle`, or `tags` fields match the search term using the existing MongoDB text index.
3. WHEN an admin provides a `categorySlug` query parameter, THE Admin_Catalog_API SHALL return only Product documents matching that `categorySlug`.
4. WHEN an admin provides a `sortBy` query parameter with value `price`, `inventoryCount`, or `name`, THE Admin_Catalog_API SHALL return Product documents sorted by that field in the direction specified by the `sortOrder` parameter (`asc` or `desc`).
5. WHEN an admin submits a valid create-product request, THE Admin_Catalog_API SHALL persist a new Product document and return it with HTTP 201.
6. IF a create-product request is submitted with a `slug` that already exists, THEN THE Admin_Catalog_API SHALL return HTTP 409 with a descriptive error message.
7. WHEN an admin submits a valid update-product request for an existing product, THE Admin_Catalog_API SHALL update the Product document and return the updated document with HTTP 200.
8. IF an update-product request references a `slug` that does not exist, THEN THE Admin_Catalog_API SHALL return HTTP 404.
9. WHEN an admin submits a delete-product request for an existing product, THE Admin_Catalog_API SHALL remove the Product document and return HTTP 204.
10. WHEN an admin submits a bulk-stock-update request containing an array of `{ slug, inventoryCount }` pairs, THE Admin_Catalog_API SHALL update the `inventoryCount` of each referenced Product document in a single database operation and return the count of updated documents.
11. WHEN an admin toggles the `featured`, `bestSeller`, or `newArrival` flag on a product, THE Admin_Catalog_API SHALL update only that boolean field on the Product document and return the updated document.
12. THE Product_Management_Page SHALL display an out-of-stock indicator for products where `inventoryCount === 0`.
13. THE Product_Management_Page SHALL display a low-stock warning for products where `inventoryCount > 0` and `inventoryCount < 5`.
14. THE Product_Management_Page SHALL require admin confirmation before executing a delete-product action.

---

### Requirement 4: Order Management

**User Story:** As an admin, I want to view, search, filter, and manage all orders, so that I can resolve payment issues and track revenue accurately.

#### Acceptance Criteria

1. WHEN an admin requests the order list, THE Admin_Orders_API SHALL return all Order documents with support for pagination using `page` and `limit` query parameters.
2. WHEN an admin provides a `search` query parameter, THE Admin_Orders_API SHALL return only Order documents where `orderNumber` or `customer.email` contains the search term (case-insensitive).
3. WHEN an admin provides a `status` query parameter, THE Admin_Orders_API SHALL return only Order documents matching that Order_Status value.
4. WHEN an admin provides a `provider` query parameter, THE Admin_Orders_API SHALL return only Order documents matching that Payment_Provider value.
5. WHEN an admin provides `dateFrom` and `dateTo` query parameters, THE Admin_Orders_API SHALL return only Order documents where `createdAt` falls within the inclusive date range.
6. WHEN an admin requests a single order by ID, THE Admin_Orders_API SHALL return the full Order document including all nested sub-documents (`customer`, `items`, `pricing`, `providerMetadata`, `history`).
7. WHEN an admin submits a status-override request for an order, THE Admin_Orders_API SHALL update the Order's `status` field, append a new entry to the `history` array with the new status, a note of `"Admin override"`, and the current timestamp, and return the updated Order document.
8. IF a status-override request references an order ID that does not exist, THEN THE Admin_Orders_API SHALL return HTTP 404.
9. WHEN an admin requests a CSV export, THE Admin_Orders_API SHALL return a downloadable CSV file containing one row per Order with columns: `orderNumber`, `status`, `paymentProvider`, `customer.fullName`, `customer.email`, `pricing.total`, `pricing.currency`, `paidAt`, `createdAt`.
10. WHEN an admin applies active filters before requesting a CSV export, THE Admin_Orders_API SHALL apply the same filter parameters to the CSV export as to the paginated list.
11. WHEN an admin loads the order statistics view, THE Admin_Orders_API SHALL return the sum of `pricing.total` for paid orders grouped by `paymentProvider`.

---

### Requirement 5: User Management

**User Story:** As an admin, I want to view and manage user accounts, so that I can support customers and control platform access.

#### Acceptance Criteria

1. WHEN an admin requests the user list, THE Admin_Users_API SHALL return all User documents (excluding `password` and `resetToken` fields) with support for pagination using `page` and `limit` query parameters.
2. WHEN an admin provides a `search` query parameter, THE Admin_Users_API SHALL return only User documents where `name` or `email` contains the search term (case-insensitive).
3. WHEN an admin requests a single user profile by ID, THE Admin_Users_API SHALL return the User document along with the count of orders associated with that user and the sum of `pricing.total` for that user's paid orders.
4. WHEN an admin requests a user's order history, THE Admin_Users_API SHALL return all Order documents where `userId` matches the requested user ID, sorted by `createdAt` descending.
5. WHEN an admin submits a promote-to-admin request for a user, THE Admin_Users_API SHALL set the target user's `role` field to `admin` and return the updated User document.
6. WHEN an admin submits a demote-from-admin request for a user, THE Admin_Users_API SHALL set the target user's `role` field to `user` and return the updated User document.
7. IF an admin attempts to demote their own account, THEN THE Admin_Users_API SHALL return HTTP 400 with the message `"Admins cannot demote their own account"`.
8. WHEN an admin submits a disable-user request, THE Admin_Users_API SHALL set the target user's `isActive` field to `false` and return the updated User document.
9. WHEN an admin submits an enable-user request, THE Admin_Users_API SHALL set the target user's `isActive` field to `true` and return the updated User document.
10. IF an admin attempts to disable their own account, THEN THE Admin_Users_API SHALL return HTTP 400 with the message `"Admins cannot disable their own account"`.

---

### Requirement 6: Payment Method Configuration

**User Story:** As an admin, I want to enable or disable payment providers at runtime, so that I can respond to outages or business decisions without redeploying the application.

#### Acceptance Criteria

1. THE Provider_Config_Schema SHALL store one document per Payment_Provider containing the fields `provider` (string), `enabled` (boolean), and `updatedAt` (date).
2. WHEN the application starts, THE Provider_Config_Service SHALL seed a Provider_Config document for each Payment_Provider if one does not already exist, defaulting `enabled` to `true`.
3. WHEN an admin requests the payment configuration status, THE Admin_Payments_API SHALL return the current `enabled` state for each Payment_Provider along with whether the required environment variables for that provider are present.
4. WHEN an admin submits a toggle request for a Payment_Provider, THE Admin_Payments_API SHALL update the `enabled` field on the corresponding Provider_Config document and return the updated configuration.
5. WHEN a checkout session is requested for a Payment_Provider, THE Payments_Service SHALL check the Provider_Config document for that provider and reject the request with HTTP 400 if `enabled === false`.
6. THE Admin_Payments_Page SHALL display the Stripe configuration status, indicating whether `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` environment variables are present (without exposing their values).
7. THE Admin_Payments_Page SHALL display the eSewa configuration status, indicating whether `ESEWA_PRODUCT_CODE` and `ESEWA_SECRET_KEY` environment variables are present (without exposing their values).

---

### Requirement 7: Inventory Management

**User Story:** As an admin, I want a dedicated inventory view with inline editing and stock history, so that I can efficiently manage stock levels across the catalog.

#### Acceptance Criteria

1. WHEN an admin requests the inventory list, THE Admin_Inventory_API SHALL return all Product documents with fields `slug`, `name`, `categoryName`, `inventoryCount`, and `_id`, with support for pagination using `page` and `limit` query parameters.
2. WHEN an admin provides a `stockFilter` query parameter with value `in_stock`, `low_stock`, or `out_of_stock`, THE Admin_Inventory_API SHALL return only Product documents matching the corresponding condition: `inventoryCount > 4`, `inventoryCount > 0 AND inventoryCount < 5`, or `inventoryCount === 0` respectively.
3. WHEN an admin submits an inline stock update for a single product, THE Admin_Inventory_API SHALL update the product's `inventoryCount`, append a Stock_History_Entry to the product's stock history, and return the updated product.
4. WHEN an admin submits a bulk-restock request containing an array of `{ slug, inventoryCount }` pairs, THE Admin_Inventory_API SHALL update each product's `inventoryCount` and append a Stock_History_Entry for each updated product.
5. THE Stock_History_Entry SHALL contain the fields `previousCount` (number), `newCount` (number), `reason` (string), `changedBy` (admin user ID), and `changedAt` (date).
6. WHEN an admin requests the stock history for a product, THE Admin_Inventory_API SHALL return all Stock_History_Entry records for that product sorted by `changedAt` descending.
7. THE Inventory_Management_Page SHALL display an out-of-stock badge for products where `inventoryCount === 0`.
8. THE Inventory_Management_Page SHALL display a low-stock badge for products where `inventoryCount > 0` and `inventoryCount < 5`.

---

### Requirement 8: Admin Navigation and Layout

**User Story:** As an admin, I want a consistent navigation structure, so that I can move between admin sections efficiently.

#### Acceptance Criteria

1. THE Admin_Layout SHALL include a sidebar with navigation links to: Overview, Products, Orders, Users, Inventory, and Settings (payment configuration).
2. THE Admin_Layout SHALL include breadcrumb navigation that reflects the current page hierarchy.
3. WHILE a user is authenticated with `role === 'admin'`, THE Application_Header SHALL display an admin badge adjacent to the user's name or avatar.
4. THE Admin_Layout SHALL be responsive, collapsing the sidebar into a hamburger menu on viewports narrower than 768px.
5. THE Admin_Layout SHALL apply the existing CSS variable-based design system and SHALL support both light and dark color modes.
6. WHEN an admin navigates to `/admin`, THE Admin_Router SHALL redirect to `/admin/overview`.
7. THE Admin_Layout SHALL highlight the active sidebar navigation item corresponding to the current route.
