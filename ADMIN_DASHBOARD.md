# Admin Dashboard Documentation

## Overview

A production-grade admin dashboard for managing your e-commerce platform, inspired by Amazon's admin interface. This comprehensive system provides full control over products, users, orders, and inventory management.

## Features

### 🎯 Dashboard Overview
- **Real-time Statistics**: Total users, products, orders, and revenue
- **Recent Orders**: Quick view of latest customer orders
- **Low Stock Alerts**: Automatic notifications for products running low
- **Top Selling Products**: Analytics on best-performing items
- **Order Status Breakdown**: Visual representation of order pipeline

### 📦 Product Management
- **Full CRUD Operations**: Create, read, update, and delete products
- **Inventory Tracking**: Real-time stock level management
- **Category Management**: Organize products into categories
- **Product Attributes**:
  - Name, subtitle, and descriptions
  - Pricing and compare-at pricing
  - Stock levels with low-stock alerts
  - Featured, best seller, and new arrival flags
  - Tags and key highlights
  - Visual customization (gradients, colors, glyphs)
  - Product specifications
- **Bulk Operations**: Quick stock updates
- **Search & Filter**: Find products by name, category, or description

### 👥 User Management
- **User Directory**: Complete list of all registered users
- **User Details**: View purchase history and account statistics
- **Role Management**: Promote users to admin or demote to regular users
- **Account Status**: Activate or deactivate user accounts
- **User Analytics**: Total orders and spending per user
- **Search Functionality**: Find users by name or email

### 🛒 Order Management
- **Order Tracking**: View all orders with detailed information
- **Status Management**: Update order status through the fulfillment pipeline
  - Pending → Processing → Paid → Completed → Shipped → Delivered
  - Handle Cancelled and Refunded orders
- **Order Details**: Customer information, items, pricing, and payment details
- **Filter by Status**: Quick access to orders in specific states
- **Customer History**: View all orders from a specific customer

### 🔐 Security & Access Control
- **Role-Based Access**: Admin-only routes protected by JWT authentication
- **Route Guards**: Automatic redirection for unauthorized access
- **Secure API**: All admin endpoints require admin role verification
- **Password Hashing**: bcrypt encryption for user passwords

## Getting Started

### 1. Create Admin User

Run the seed script to create your first admin user:

```bash
cd backend
npm run seed:admin
```

**Default Credentials:**
- Email: `admin@example.com`
- Password: `Admin@123456`

**Custom Admin User:**
```bash
ADMIN_EMAIL=your@email.com ADMIN_PASSWORD=YourPassword ADMIN_NAME="Your Name" npm run seed:admin
```

⚠️ **Important**: Change the default password immediately after first login!

### 2. Login as Admin

1. Navigate to `/login`
2. Enter admin credentials
3. You'll be automatically redirected to the admin dashboard at `/admin`

### 3. Access Admin Panel

Once logged in as admin, access the dashboard at:
```
http://localhost:5173/admin
```

## Admin Panel Structure

```
/admin
├── /                    # Dashboard (overview & statistics)
├── /products           # Product management
│   ├── /new           # Add new product
│   └── /:id/edit      # Edit existing product
├── /orders            # Order management
│   └── /:id           # Order details
├── /users             # User management
│   └── /:id           # User details
└── /settings          # Admin settings (coming soon)
```

## API Endpoints

### Dashboard
- `GET /admin/dashboard/stats` - Get dashboard statistics

### Products
- `GET /admin/products` - List all products (paginated)
- `GET /admin/products/:id` - Get product details
- `POST /admin/products` - Create new product
- `PUT /admin/products/:id` - Update product
- `DELETE /admin/products/:id` - Delete product
- `PUT /admin/products/:id/stock` - Update stock level

### Users
- `GET /admin/users` - List all users (paginated)
- `GET /admin/users/:id` - Get user details with order history
- `PUT /admin/users/:id` - Update user (role, status, etc.)
- `DELETE /admin/users/:id` - Delete user

### Orders
- `GET /admin/orders` - List all orders (paginated)
- `GET /admin/orders/:id` - Get order details
- `PUT /admin/orders/:id/status` - Update order status

### Categories
- `GET /admin/categories` - List all categories
- `POST /admin/categories` - Create category
- `PUT /admin/categories/:id` - Update category
- `DELETE /admin/categories/:id` - Delete category

## User Roles

### Admin Role
- Full access to admin dashboard
- Can manage products, users, and orders
- Can promote/demote other users
- Can view all analytics and reports

### User Role (Default)
- Standard customer access
- Can browse products and place orders
- Can view own order history
- Cannot access admin panel

## Technical Architecture

### Backend (NestJS)
```
backend/src/
├── admin/
│   ├── admin.module.ts          # Admin module configuration
│   ├── admin.controller.ts      # API endpoints
│   ├── admin.service.ts         # Business logic
│   └── dto/                     # Data transfer objects
├── auth/
│   ├── guards/
│   │   ├── jwt-auth.guard.ts    # JWT authentication
│   │   └── roles.guard.ts       # Role-based access control
│   └── decorators/
│       └── roles.decorator.ts   # @Roles() decorator
└── users/
    └── schemas/
        └── user.schema.ts       # User model with role enum
```

### Frontend (React + TypeScript)
```
frontend/src/features/admin/
├── AdminLayout.tsx              # Admin panel layout with sidebar
├── AdminDashboard.tsx           # Dashboard overview
├── ProductsManagement.tsx       # Product list & management
├── ProductForm.tsx              # Add/edit product form
├── OrdersManagement.tsx         # Order list & management
├── UsersManagement.tsx          # User list & management
├── api/
│   └── adminApi.ts             # API client for admin endpoints
└── components/
    ├── DashboardStats.tsx       # Statistics cards
    ├── RecentOrders.tsx         # Recent orders table
    ├── LowStockAlert.tsx        # Low stock warnings
    └── TopProducts.tsx          # Top selling products
```

## Design Features

### Modern UI/UX
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Sidebar Navigation**: Easy access to all admin sections
- **Loading States**: Smooth loading indicators
- **Error Handling**: User-friendly error messages
- **Confirmation Dialogs**: Prevent accidental deletions
- **Status Badges**: Color-coded order and product statuses
- **Search & Filters**: Quick data access
- **Pagination**: Handle large datasets efficiently

### Color Coding
- **Green**: Active, in stock, completed, delivered
- **Yellow**: Low stock, pending orders
- **Blue**: Processing, admin role
- **Red**: Out of stock, cancelled, inactive
- **Purple**: Shipped, featured items

## Best Practices

### Security
1. Always use HTTPS in production
2. Implement rate limiting on admin endpoints
3. Log all admin actions for audit trails
4. Use strong passwords for admin accounts
5. Enable two-factor authentication (recommended)

### Data Management
1. Regular database backups
2. Soft delete for important records
3. Maintain audit logs
4. Validate all input data
5. Sanitize user-generated content

### Performance
1. Implement caching for dashboard stats
2. Use pagination for large datasets
3. Optimize database queries
4. Lazy load images and components
5. Monitor API response times

## Troubleshooting

### Cannot Access Admin Panel
- Verify user has admin role in database
- Check JWT token is valid
- Clear browser cache and localStorage
- Verify backend is running

### Admin User Not Created
- Check MongoDB connection
- Verify environment variables
- Check console for error messages
- Ensure bcrypt is installed

### API Errors
- Check backend logs
- Verify JWT token in request headers
- Ensure admin role is set correctly
- Check CORS configuration

## Future Enhancements

- [ ] Advanced analytics and reporting
- [ ] Bulk product import/export (CSV)
- [ ] Email notifications for low stock
- [ ] Customer support ticket system
- [ ] Discount and coupon management
- [ ] Shipping provider integration
- [ ] Multi-language support
- [ ] Dark mode theme
- [ ] Activity logs and audit trails
- [ ] Advanced search with filters
- [ ] Product reviews moderation
- [ ] Inventory forecasting
- [ ] Sales reports and charts

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review API documentation
3. Check backend logs
4. Verify database connection
5. Contact development team

## License

This admin dashboard is part of the AI Commerce Platform and follows the same license terms.
