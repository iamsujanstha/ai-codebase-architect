# Admin Dashboard - Quick Setup Guide

## 🚀 Quick Start (5 Minutes)

### Step 1: Start Your Services

Make sure your backend and database are running:

```bash
# Start MongoDB and backend
docker-compose up -d mongo backend

# Or if running locally
cd backend
npm run start:dev
```

### Step 2: Create Admin User

```bash
cd backend
npm run seed:admin
```

You'll see:
```
✅ Admin user created successfully!
Email: admin@example.com
Password: Admin@123456

⚠️  Please change the password after first login!
```

### Step 3: Login

1. Open your browser: `http://localhost:5173`
2. Click "Login" or go to `http://localhost:5173/login`
3. Enter credentials:
   - Email: `admin@example.com`
   - Password: `Admin@123456`
4. You'll be redirected to `/admin` automatically

### Step 4: Explore Admin Panel

You now have access to:
- 📊 **Dashboard** - Overview and statistics
- 📦 **Products** - Manage your catalog
- 🛒 **Orders** - Track and fulfill orders
- 👥 **Users** - Manage customer accounts

## 🎨 Admin Panel Features

### Dashboard Overview
- Total users, products, orders, revenue
- Recent orders list
- Low stock alerts
- Top selling products

### Product Management
- Add new products with full details
- Update existing products
- Manage inventory levels
- Set featured/bestseller flags
- Organize by categories

### Order Management
- View all orders
- Update order status
- Filter by status (pending, processing, shipped, etc.)
- View customer details

### User Management
- View all registered users
- Promote users to admin
- Deactivate accounts
- View user purchase history

## 🔐 Creating Additional Admins

### Method 1: Using the Seed Script

```bash
ADMIN_EMAIL=newadmin@company.com \
ADMIN_PASSWORD=SecurePass123 \
ADMIN_NAME="New Admin" \
npm run seed:admin
```

### Method 2: Through Admin Panel

1. Login as existing admin
2. Go to **Users** section
3. Find the user you want to promote
4. Click their role badge to toggle between "user" and "admin"

### Method 3: Direct Database Update

```javascript
// In MongoDB shell or Compass
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { role: "admin" } }
)
```

## 🛡️ Security Best Practices

### Change Default Password

After first login:
1. Go to your profile settings
2. Update password to something secure
3. Use a password manager

### Recommended Password Policy
- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, symbols
- No common words or patterns
- Unique per admin user

### Additional Security
- Enable HTTPS in production
- Implement rate limiting
- Add two-factor authentication
- Regular security audits
- Monitor admin activity logs

## 📱 Mobile Access

The admin panel is fully responsive:
- Works on tablets and phones
- Touch-friendly interface
- Collapsible sidebar menu
- Optimized for small screens

## 🔧 Troubleshooting

### "Cannot access admin panel"
**Solution**: Verify your user has admin role
```bash
# Check in MongoDB
db.users.findOne({ email: "your@email.com" })
# Should show: role: "admin"
```

### "Unauthorized" error
**Solution**: 
1. Logout and login again
2. Clear browser cache
3. Check JWT token expiration

### Admin user not created
**Solution**:
1. Verify MongoDB is running: `docker ps`
2. Check backend logs: `docker logs backend`
3. Ensure environment variables are set

### Cannot see admin menu
**Solution**:
1. Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Check browser console for errors
3. Verify you're logged in as admin

## 🎯 Common Tasks

### Add Your First Product

1. Go to **Products** → **Add Product**
2. Fill in required fields:
   - Product name
   - Description
   - Price
   - Inventory count
   - Category
3. Optional: Add tags, highlights, images
4. Click **Save Product**

### Process an Order

1. Go to **Orders**
2. Click on an order to view details
3. Click the status badge
4. Enter new status (e.g., "shipped")
5. Order status updates automatically

### Manage Low Stock

1. Dashboard shows low stock alerts
2. Click on a product
3. Update inventory count
4. Or go to **Products** → Click stock count → Update

## 📊 Understanding Dashboard Stats

### Total Revenue
- Sum of all completed/paid orders
- Excludes cancelled and refunded orders

### Order Status Breakdown
- **Pending**: Awaiting payment
- **Processing**: Payment received, preparing order
- **Paid**: Payment confirmed
- **Shipped**: Order dispatched
- **Delivered**: Order received by customer
- **Cancelled**: Order cancelled
- **Refunded**: Payment returned

### Low Stock Threshold
- Products with ≤10 units trigger alerts
- Out of stock: 0 units
- Low stock: 1-10 units

## 🚀 Next Steps

1. **Customize Categories**: Add your product categories
2. **Import Products**: Use the product form to add your catalog
3. **Set Up Payment Methods**: Configure Stripe/PayPal in settings
4. **Configure Shipping**: Set up shipping zones and rates
5. **Test Order Flow**: Place a test order and process it
6. **Train Your Team**: Share this guide with other admins

## 📚 Additional Resources

- [Full Admin Documentation](./ADMIN_DASHBOARD.md)
- [API Documentation](./ARCHITECTURE.md)
- [User Management Guide](./ADMIN_DASHBOARD.md#user-management)
- [Product Management Guide](./ADMIN_DASHBOARD.md#product-management)

## 💡 Pro Tips

1. **Keyboard Shortcuts**: Use browser search (Ctrl+F) to quickly find products/users
2. **Bulk Updates**: Select multiple items for batch operations
3. **Export Data**: Use browser dev tools to export table data
4. **Bookmarks**: Bookmark frequently used admin pages
5. **Multiple Tabs**: Open different admin sections in separate tabs

## 🆘 Need Help?

If you encounter issues:
1. Check the troubleshooting section above
2. Review backend logs: `docker logs backend`
3. Check browser console for errors
4. Verify database connection
5. Restart services if needed

---

**Ready to manage your store like Amazon!** 🎉
