# Requirements Document: Authenticated Checkout and Order History

## Introduction

This document specifies the requirements for adding authentication-protected checkout and order history features to the Atlas Commerce Lab ecommerce platform. Currently, the platform allows anonymous checkout where users can purchase products without logging in. This feature will require users to authenticate before checkout, associate orders with user accounts, and provide an order history interface where authenticated users can view all their past orders.

The feature builds upon the existing JWT-based authentication system (email/password and Google OAuth), the existing payment system (Stripe and eSewa integration), and the existing Order and User schemas.

## Glossary

- **Authentication_System**: The JWT-based authentication service that validates user credentials and issues access tokens
- **Checkout_Guard**: The authentication protection mechanism that prevents unauthenticated users from accessing checkout
- **Order_Service**: The backend service responsible for creating, storing, and retrieving order records
- **Payment_Service**: The existing service that orchestrates payment processing through Stripe and eSewa providers
- **Order_History_API**: The backend endpoint that retrieves all orders associated with an authenticated user
- **Order_History_UI**: The frontend page that displays a user's past orders with details
- **User_Account**: An authenticated user record stored in the User schema with a unique identifier
- **Order_Record**: A stored order document in the Order schema containing transaction details
- **User_Order_Association**: The linkage between an Order_Record and a User_Account via userId field
- **Anonymous_Order**: An existing order created before this feature that has no userId association
- **Authenticated_User**: A user who has successfully logged in and possesses a valid JWT token
- **Unauthenticated_User**: A user who has not logged in or whose JWT token is invalid or expired

## Requirements

### Requirement 1: Authentication Guard for Checkout Access

**User Story:** As a platform administrator, I want to require authentication before checkout, so that all orders are associated with user accounts for better customer service and order tracking.

#### Acceptance Criteria

1. WHEN an Unauthenticated_User attempts to access the checkout route, THE Checkout_Guard SHALL redirect the user to the login page
2. WHEN an Authenticated_User accesses the checkout route, THE Checkout_Guard SHALL allow access to the checkout flow
3. WHEN an Unauthenticated_User is redirected to login, THE Authentication_System SHALL preserve the checkout intent and redirect back to checkout after successful authentication
4. THE Checkout_Guard SHALL validate the JWT token before granting checkout access
5. WHEN a JWT token is expired or invalid, THE Checkout_Guard SHALL treat the user as unauthenticated

### Requirement 2: User-Order Association in Database

**User Story:** As a developer, I want orders to be linked to user accounts in the database, so that we can retrieve all orders for a specific user.

#### Acceptance Criteria

1. THE Order_Service SHALL add a userId field to the Order schema
2. THE Order_Service SHALL create a database index on the userId field for efficient query performance
3. WHEN an Authenticated_User creates an order, THE Order_Service SHALL store the user's unique identifier in the userId field
4. THE Order_Service SHALL maintain backward compatibility with Anonymous_Orders by allowing userId to be null
5. THE Order_Service SHALL validate that the userId corresponds to an existing User_Account before creating the order

### Requirement 3: Payment Service Integration with Authentication

**User Story:** As a developer, I want the payment service to accept and store userId from authenticated requests, so that orders are automatically linked to the correct user account.

#### Acceptance Criteria

1. WHEN an Authenticated_User initiates a payment session, THE Payment_Service SHALL extract the userId from the JWT token
2. THE Payment_Service SHALL pass the userId to the Order_Service when creating an order snapshot
3. THE Payment_Service SHALL include the userId in order creation for both Stripe and eSewa payment providers
4. WHEN creating a Stripe checkout session, THE Payment_Service SHALL include userId in the session metadata
5. WHEN creating an eSewa checkout, THE Payment_Service SHALL include userId in the order record before redirect

### Requirement 4: Order History Retrieval API

**User Story:** As an authenticated user, I want to retrieve all my past orders through an API, so that I can view my purchase history.

#### Acceptance Criteria

1. THE Order_History_API SHALL provide a GET endpoint at /payments/orders
2. WHEN an Authenticated_User requests their order history, THE Order_History_API SHALL return all orders where userId matches the authenticated user's identifier
3. THE Order_History_API SHALL require JWT authentication and reject requests from Unauthenticated_Users with HTTP 401 status
4. THE Order_History_API SHALL return orders sorted by creation date in descending order (newest first)
5. THE Order_History_API SHALL return order records including orderNumber, status, pricing, items, customer snapshot, paidAt timestamp, and creation timestamp
6. WHEN a user has no orders, THE Order_History_API SHALL return an empty array with HTTP 200 status
7. THE Order_History_API SHALL limit results to 100 orders per request to prevent excessive data transfer
8. THE Order_History_API SHALL support pagination through skip and limit query parameters

### Requirement 5: Order History User Interface

**User Story:** As an authenticated user, I want to view my order history in a dedicated page, so that I can review my past purchases and order details.

#### Acceptance Criteria

1. THE Order_History_UI SHALL display a list of all orders retrieved from the Order_History_API
2. THE Order_History_UI SHALL require authentication and redirect Unauthenticated_Users to the login page
3. WHEN displaying an order, THE Order_History_UI SHALL show the order number, order date, total amount, currency, and order status
4. THE Order_History_UI SHALL provide a link or button to view full order details for each order
5. WHEN a user has no orders, THE Order_History_UI SHALL display a message indicating no orders exist
6. THE Order_History_UI SHALL display orders in chronological order with the most recent order first
7. THE Order_History_UI SHALL handle loading states while fetching order data from the API
8. THE Order_History_UI SHALL display error messages when the Order_History_API request fails

### Requirement 6: Order Details View

**User Story:** As an authenticated user, I want to view complete details of a specific past order, so that I can review what I purchased and the order status.

#### Acceptance Criteria

1. THE Order_History_UI SHALL provide a detailed view for individual orders
2. WHEN a user selects an order, THE Order_History_UI SHALL display all line items with product names, quantities, unit prices, and line totals
3. THE Order_History_UI SHALL display the pricing breakdown including subtotal, tax amount, service charge, delivery charge, and total
4. THE Order_History_UI SHALL display the customer information snapshot including name, email, phone, and address
5. THE Order_History_UI SHALL display the payment provider used for the order
6. THE Order_History_UI SHALL display the order status and payment timestamp if the order is paid
7. THE Order_History_UI SHALL display the order history timeline showing status changes and timestamps
8. WHEN an order belongs to a different user, THE Order_History_API SHALL return HTTP 404 status to prevent unauthorized access

### Requirement 7: Frontend Authentication Flow for Checkout

**User Story:** As a user, I want to be prompted to log in when I try to checkout, so that I can complete my purchase after authenticating.

#### Acceptance Criteria

1. WHEN an Unauthenticated_User clicks the checkout button, THE Order_History_UI SHALL check authentication status before navigation
2. WHEN authentication check fails, THE Order_History_UI SHALL redirect to the login page with a return URL parameter
3. WHEN a user successfully logs in from the checkout redirect, THE Authentication_System SHALL redirect back to the checkout page
4. THE Order_History_UI SHALL preserve the shopping cart contents during the authentication redirect flow
5. WHEN an Authenticated_User clicks the checkout button, THE Order_History_UI SHALL navigate directly to the checkout page

### Requirement 8: User Profile Integration

**User Story:** As an authenticated user, I want to see my order count in my user profile, so that I have quick visibility into my purchase history.

#### Acceptance Criteria

1. WHERE a user profile or dashboard exists, THE Order_History_UI SHALL display the total count of orders for the authenticated user
2. THE Order_History_UI SHALL provide a navigation link from the user profile to the order history page
3. WHEN the order count is zero, THE Order_History_UI SHALL display "No orders yet" or equivalent message
4. THE Order_History_UI SHALL update the order count after a new order is successfully completed

### Requirement 9: Backward Compatibility with Anonymous Orders

**User Story:** As a platform administrator, I want existing anonymous orders to remain accessible, so that historical data is preserved during the migration to authenticated checkout.

#### Acceptance Criteria

1. THE Order_Service SHALL allow the userId field to be null for existing Anonymous_Orders
2. THE Order_Service SHALL continue to support order lookup by orderNumber for Anonymous_Orders
3. THE Order_History_API SHALL exclude Anonymous_Orders from user order history results
4. THE Payment_Service SHALL continue to process webhook callbacks and status checks for Anonymous_Orders
5. THE Order_Service SHALL not require userId when retrieving orders by orderNumber through the existing endpoint

### Requirement 10: Security and Authorization

**User Story:** As a security engineer, I want order access to be properly authorized, so that users can only view their own orders.

#### Acceptance Criteria

1. THE Order_History_API SHALL verify that the requested order belongs to the authenticated user before returning order details
2. WHEN a user requests an order that belongs to a different user, THE Order_History_API SHALL return HTTP 404 status
3. THE Order_History_API SHALL validate JWT token signature and expiration before processing any request
4. THE Order_History_API SHALL not expose userId in API responses to prevent information disclosure
5. THE Checkout_Guard SHALL use the existing JwtAuthGuard to enforce authentication requirements
6. THE Order_History_API SHALL log unauthorized access attempts for security monitoring

### Requirement 11: Database Migration for Existing Orders

**User Story:** As a database administrator, I want a safe migration path for adding userId to existing orders, so that the system remains stable during deployment.

#### Acceptance Criteria

1. THE Order_Service SHALL add the userId field to the Order schema with a default value of null
2. THE Order_Service SHALL create a database index on userId after the field is added
3. THE Order_Service SHALL ensure the migration does not lock the orders collection for extended periods
4. THE Order_Service SHALL validate that all existing orders remain queryable after the schema change
5. THE Order_Service SHALL support rollback by ensuring the userId field is optional

### Requirement 12: API Response Format Consistency

**User Story:** As a frontend developer, I want consistent API response formats, so that I can reliably parse and display order data.

#### Acceptance Criteria

1. THE Order_History_API SHALL return order data in the same format as the existing order summary endpoint
2. THE Order_History_API SHALL include all fields from OrderSummaryResponse interface for each order
3. THE Order_History_API SHALL return a JSON array of order objects with consistent field names and types
4. WHEN an error occurs, THE Order_History_API SHALL return error responses following the existing ApiErrorResponse format
5. THE Order_History_API SHALL use consistent date formatting (ISO 8601) for all timestamp fields
