# Admin Panel Access Guide

## 🎯 How to Access the Admin Panel

### Method 1: Direct URL (Recommended)
Simply navigate to:
```
http://localhost:5173/admin
```

If you're not logged in, you'll be redirected to the login page and then back to the admin panel.

### Method 2: Through User Menu
1. Login to the site: `http://localhost:5173/login`
2. Click on your user avatar/name in the top right
3. Click "Admin Panel" (only visible if you're an admin)

## 🔐 Admin Credentials

```
Email:    admin@example.com
Password: Admin@123456
```

⚠️ **Change this password after first login!**

## 📍 Admin Panel Routes

Once logged in as admin, you can access:

- **Dashboard**: `/admin` or `/admin/dashboard`
  - Overview statistics
  - Recent orders
  - Low stock alerts
  - Top selling products

- **Products**: `/admin/products`
  - View all products
  - Add new product: `/admin/products/new`
  - Edit product: `/admin/products/:id/edit`
  - Search and filter products
  - Update stock levels

- **Orders**: `/admin/orders`
  - View all orders
  - Filter by status
  - Update order status
  - View order details

- **Users**: `/admin/users`
  - View all users
  - Promote/demote admin role
  - Activate/deactivate accounts
  - View user purchase history

- **Settings**: `/admin/settings`
  - Store configuration
  - Payment methods
  - Email settings
  - Security settings

## 🎨 UI Fixed!

The admin panel now has proper styling with:
- ✅ Tailwind CSS properly configured
- ✅ Responsive design
- ✅ Modern, clean interface
- ✅ Color-coded status indicators
- ✅ Mobile-friendly layout

## 🚀 Quick Start

1. **Login as Admin**
   ```bash
   # Open browser
   open http://localhost:5173/login
   
   # Or manually navigate to:
   http://localhost:5173/login
   ```

2. **Enter Credentials**
   - Email: admin@example.com
   - Password: Admin@123456

3. **Access Admin Panel**
   - Click "Admin Panel" in user menu, OR
   - Navigate directly to: http://localhost:5173/admin

## 🔍 Troubleshooting

### Cannot See "Admin Panel" in Menu
**Problem**: Menu item not visible
**Solution**: 
1. Verify you're logged in as admin
2. Check user role in database:
   ```bash
   docker-compose exec mongo mongosh ai_commerce_platform
   db.users.findOne({email: "admin@example.com"})
   ```
3. Should show `role: "admin"`

### Redirected to Home Page
**Problem**: Cannot access /admin routes
**Solution**:
1. Logout and login again
2. Clear browser cache
3. Check browser console for errors
4. Verify backend is running

### UI Looks Broken
**Problem**: Styling not applied
**Solution**:
1. Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Clear browser cache
3. Check if frontend container is running:
   ```bash
   docker-compose ps frontend
   ```

### 404 Not Found
**Problem**: Admin routes return 404
**Solution**:
1. Verify frontend is rebuilt with latest changes
2. Restart frontend container:
   ```bash
   docker-compose restart frontend
   ```
3. Check nginx configuration

## 📱 Mobile Access

The admin panel is fully responsive and works on:
- 📱 Mobile phones (320px+)
- 📱 Tablets (768px+)
- 💻 Laptops (1024px+)
- 🖥️ Desktops (1920px+)

On mobile:
- Tap the hamburger menu (☰) to open sidebar
- All features are touch-friendly
- Tables scroll horizontally
- Forms stack vertically

## 🎯 Admin Features

### Dashboard
- View key metrics at a glance
- Monitor recent orders
- Track low stock items
- See top selling products

### Product Management
- Add new products with full details
- Edit existing products
- Update stock levels quickly
- Delete products with confirmation
- Search by name or description
- Filter by category

### Order Management
- View all customer orders
- Update order status
- Filter by status (pending, paid, shipped, etc.)
- View customer details
- Track order history

### User Management
- View all registered users
- Promote users to admin
- Deactivate accounts
- View user purchase history
- Search by name or email

## 🔗 Quick Links

- **Home**: http://localhost:5173
- **Login**: http://localhost:5173/login
- **Admin Dashboard**: http://localhost:5173/admin
- **Products**: http://localhost:5173/admin/products
- **Orders**: http://localhost:5173/admin/orders
- **Users**: http://localhost:5173/admin/users

## 💡 Pro Tips

1. **Bookmark Admin Panel**: Save `/admin` for quick access
2. **Use Search**: Find products/users quickly with search
3. **Keyboard Navigation**: Tab through forms efficiently
4. **Multiple Tabs**: Open different sections in separate tabs
5. **Mobile Testing**: Test on your phone for mobile experience

## 🎉 You're All Set!

Your admin panel is now:
- ✅ Properly styled with Tailwind CSS
- ✅ Accessible via direct URL
- ✅ Accessible via user menu
- ✅ Fully functional
- ✅ Mobile responsive
- ✅ Production-ready

**Start managing your store now!** 🚀

---

**Need Help?** Check the other documentation files:
- ADMIN_DASHBOARD.md - Complete feature documentation
- ADMIN_SETUP_GUIDE.md - Setup instructions
- ADMIN_TESTING_CHECKLIST.md - Testing guide
- DEPLOYMENT_SUCCESS.md - Deployment info
