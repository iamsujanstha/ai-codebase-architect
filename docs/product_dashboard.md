# Product Management Dashboard

This document describes the Product Dashboard, which allows administrators to manage the storefront catalog.

## 1. Overview
The Dashboard is a restricted area of the application where users can add and eventually manage products. It is integrated with the main storefront to ensure that updates are reflected in real-time.

## 2. Features
- **Product Creation**: A comprehensive form to add new items to the catalog.
- **Dynamic Categories**: Fetches categories from the backend to ensure data consistency.
- **Visual Customization**: Support for setting product-specific gradients and icons (glyphs).
- **Integration**: New products are automatically slugified and stored in MongoDB.

## 3. Technical Architecture
- **Backend (`/backend/src/catalog`)**:
    - `POST /catalog/products`: Validates and saves new product data.
    - `CatalogService`: Handles slug generation and MongoDB `upsert` logic.
- **Frontend (`/frontend/src/features/dashboard`)**:
    - `DashboardPage`: The main UI component containing the product form.
    - `Dashboard.module.css`: Encapsulated styling for a consistent "Admin" look.

## 4. Usage Flow
1.  **Login**: User must be authenticated to see the "Dashboard" link in the header.
2.  **Navigation**: Clicking the link leads to `/dashboard`.
3.  **Data Entry**: Fill out the product name, price, description, and visual properties.
4.  **Submission**: On success, the product is added, and the user is redirected to the home page to see the result.

## 5. Future Enhancements
- **Image Uploads**: Integrate with AWS S3 or a similar service for real product imagery.
- **Product Editing**: Add functionality to update existing products.
- **Inventory Tracking**: Real-time stock level management and alerts.
- **Analytics**: A dashboard summary showing popular products and sales data.
