# Admin Dashboard Testing Checklist

## 🧪 Complete Testing Guide

Use this checklist to verify all admin dashboard features are working correctly.

## ✅ Pre-Testing Setup

- [ ] Backend is running (`npm run start:dev` in backend folder)
- [ ] Frontend is running (`npm run dev` in frontend folder)
- [ ] MongoDB is running (check `docker ps` or local MongoDB)
- [ ] Admin user is created (`npm run seed:admin` in backend folder)
- [ ] Browser console is open (F12) to check for errors

## 🔐 Authentication & Authorization

### Admin Login
- [ ] Navigate to `/login`
- [ ] Enter admin credentials (admin@example.com / Admin@123456)
- [ ] Successfully redirected to `/admin` dashboard
- [ ] User profile shows in sidebar with admin badge
- [ ] JWT token stored in localStorage

### Access Control
- [ ] Regular user cannot access `/admin` routes
- [ ] Unauthenticated user redirected to login
- [ ] Admin can access all admin routes
- [ ] Logout works and clears authentication

## 📊 Dashboard Overview

### Statistics Cards
- [ ] Total Users count displays correctly
- [ ] Total Products count displays correctly
- [ ] Total Orders count displays correctly
- [ ] Total Revenue displays correctly (sum of paid/completed orders)
- [ ] All cards show proper formatting (commas, currency symbols)

### Recent Orders
- [ ] Recent orders table displays (up to 10 orders)
- [ ] Order ID shows last 8 characters
- [ ] Customer email displays
- [ ] Order total shows with currency
- [ ] Status badge shows with correct color
- [ ] Click eye icon navigates to order details

### Low Stock Alert
- [ ] Shows products with ≤10 units
- [ ] Out of stock products marked in red
- [ ] Low stock products marked in yellow
- [ ] Click on product navigates to product edit
- [ ] Shows "All products well stocked" when no alerts

### Top Products
- [ ] Shows top 10 selling products
- [ ] Displays product name, units sold, revenue
- [ ] Sorted by units sold (descending)
- [ ] Proper number formatting

## 📦 Products Management

### Product List
- [ ] Products display in table format
- [ ] Product name and subtitle show
- [ ] Category displays correctly
- [ ] Price shows with currency symbol
- [ ] Stock count displays
- [ ] Status badge shows correct color (In Stock/Low Stock/Out of Stock)
- [ ] Edit and delete icons visible

### Search & Filter
- [ ] Search box filters products by name
- [ ] Search filters by description
- [ ] Search is case-insensitive
- [ ] Results update as you type
- [ ] Clear search shows all products

### Pagination
- [ ] Shows "Page X of Y"
- [ ] Previous button disabled on first page
- [ ] Next button disabled on last page
- [ ] Clicking Previous/Next changes page
- [ ] Products update when page changes

### Add Product
- [ ] Click "Add Product" button
- [ ] Form displays with all fields
- [ ] Required fields marked with *
- [ ] Category dropdown populated
- [ ] Can enter all product details
- [ ] Featured/Best Seller/New Arrival checkboxes work
- [ ] Click "Save Product" creates product
- [ ] Success message displays
- [ ] Redirected to product list
- [ ] New product appears in list

### Edit Product
- [ ] Click edit icon on a product
- [ ] Form pre-filled with product data
- [ ] Can modify all fields
- [ ] Category pre-selected
- [ ] Checkboxes reflect current state
- [ ] Click "Save Product" updates product
- [ ] Success message displays
- [ ] Redirected to product list
- [ ] Changes reflected in list

### Delete Product
- [ ] Click delete icon
- [ ] Confirmation dialog appears
- [ ] Click "Cancel" - nothing happens
- [ ] Click "OK" - product deleted
- [ ] Success message displays
- [ ] Product removed from list

### Update Stock
- [ ] Click on stock count
- [ ] Prompt appears with current stock
- [ ] Enter new stock value
- [ ] Click "OK" - stock updates
- [ ] New stock count displays
- [ ] Status badge updates if needed

## 🛒 Orders Management

### Order List
- [ ] Orders display in table format
- [ ] Order ID shows (last 8 chars)
- [ ] Customer name and email display
- [ ] Item count shows
- [ ] Total amount displays with currency
- [ ] Status badge shows with correct color
- [ ] Date displays in readable format
- [ ] Eye icon visible for viewing details

### Status Filter
- [ ] Filter dropdown shows all status options
- [ ] Selecting status filters orders
- [ ] "All Orders" shows all orders
- [ ] Each status filter works correctly
- [ ] Order count updates with filter

### Update Order Status
- [ ] Click on status badge
- [ ] Prompt shows current status
- [ ] Enter new status (pending, processing, paid, etc.)
- [ ] Click "OK" - status updates
- [ ] New status displays with correct color
- [ ] Invalid status rejected

### Pagination
- [ ] Pagination works same as products
- [ ] Page navigation updates orders
- [ ] Filter persists across pages

## 👥 Users Management

### User List
- [ ] Users display in table format
- [ ] User avatar or initial shows
- [ ] Name and email display
- [ ] Role badge shows (admin/user)
- [ ] Status badge shows (Active/Inactive)
- [ ] Join date displays
- [ ] Eye and delete icons visible

### Search Users
- [ ] Search box filters by name
- [ ] Search filters by email
- [ ] Search is case-insensitive
- [ ] Results update as you type
- [ ] Clear search shows all users

### Toggle User Role
- [ ] Click on role badge
- [ ] Confirmation dialog appears
- [ ] Click "OK" - role toggles (admin ↔ user)
- [ ] Badge updates with new role
- [ ] Badge color changes (purple for admin, gray for user)

### Toggle User Status
- [ ] Click on status badge
- [ ] Confirmation dialog appears
- [ ] Click "OK" - status toggles (Active ↔ Inactive)
- [ ] Badge updates with new status
- [ ] Badge color changes (green for active, red for inactive)

### View User Details
- [ ] Click eye icon
- [ ] User details page displays
- [ ] Shows user information
- [ ] Shows order history
- [ ] Shows total orders and spending
- [ ] Can navigate back to user list

### Delete User
- [ ] Click delete icon
- [ ] Confirmation dialog appears
- [ ] Click "Cancel" - nothing happens
- [ ] Click "OK" - user deleted
- [ ] Success message displays
- [ ] User removed from list

### Pagination
- [ ] Pagination works same as products
- [ ] Page navigation updates users
- [ ] Search persists across pages

## ⚙️ Settings Page

### Page Display
- [ ] Settings page loads
- [ ] All sections display (General, Notifications, Payment, Security, Email)
- [ ] Form fields are editable
- [ ] Checkboxes toggle
- [ ] Dropdowns work
- [ ] "Save All Settings" button visible

### Note Display
- [ ] Yellow info box displays at bottom
- [ ] Note explains settings are placeholders
- [ ] Proper styling and formatting

## 🎨 UI/UX Testing

### Responsive Design
- [ ] Desktop view (>1024px) - sidebar always visible
- [ ] Tablet view (768-1024px) - sidebar collapsible
- [ ] Mobile view (<768px) - hamburger menu works
- [ ] Tables scroll horizontally on small screens
- [ ] Forms stack vertically on mobile
- [ ] Buttons are touch-friendly

### Navigation
- [ ] Sidebar links highlight active page
- [ ] Clicking logo/title goes to dashboard
- [ ] All navigation links work
- [ ] Back buttons work correctly
- [ ] Breadcrumbs show current location (if implemented)

### Loading States
- [ ] Spinner shows while loading data
- [ ] Loading text displays
- [ ] UI doesn't flash/jump
- [ ] Smooth transitions

### Error Handling
- [ ] Network errors show user-friendly messages
- [ ] Invalid input shows validation errors
- [ ] 404 errors handled gracefully
- [ ] API errors don't crash the app
- [ ] Console shows helpful error messages

### Visual Feedback
- [ ] Buttons change on hover
- [ ] Table rows highlight on hover
- [ ] Clicked items show active state
- [ ] Success messages appear and disappear
- [ ] Error messages are visible and clear

## 🔒 Security Testing

### Authentication
- [ ] Cannot access admin routes without login
- [ ] Cannot access admin routes as regular user
- [ ] JWT token expires after timeout
- [ ] Logout clears all auth data
- [ ] Refresh page maintains auth state

### Authorization
- [ ] All admin API calls include JWT token
- [ ] Regular users get 403 Forbidden on admin endpoints
- [ ] Invalid tokens rejected
- [ ] Expired tokens handled properly

### Input Validation
- [ ] Required fields cannot be empty
- [ ] Email format validated
- [ ] Number fields only accept numbers
- [ ] Negative numbers rejected where appropriate
- [ ] SQL injection attempts blocked
- [ ] XSS attempts sanitized

## 🚀 Performance Testing

### Load Times
- [ ] Dashboard loads in <2 seconds
- [ ] Product list loads in <2 seconds
- [ ] Order list loads in <2 seconds
- [ ] User list loads in <2 seconds
- [ ] Forms load instantly

### Data Handling
- [ ] Pagination works with 100+ items
- [ ] Search works with large datasets
- [ ] No lag when typing in search
- [ ] Tables render smoothly
- [ ] No memory leaks (check browser task manager)

## 🌐 Browser Compatibility

### Desktop Browsers
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

### Mobile Browsers
- [ ] Chrome Mobile
- [ ] Safari iOS
- [ ] Samsung Internet

## 📱 Mobile Testing

### Touch Interactions
- [ ] Buttons are easily tappable
- [ ] No accidental clicks
- [ ] Swipe gestures work (if implemented)
- [ ] Pinch to zoom disabled on forms

### Mobile Layout
- [ ] Sidebar collapses to hamburger menu
- [ ] Tables scroll horizontally
- [ ] Forms are easy to fill
- [ ] Text is readable without zooming
- [ ] Images scale properly

## 🐛 Bug Testing

### Edge Cases
- [ ] Empty states display properly (no products, no orders, etc.)
- [ ] Very long product names don't break layout
- [ ] Very large numbers display correctly
- [ ] Special characters in names handled
- [ ] Emoji in text fields work

### Concurrent Actions
- [ ] Multiple tabs don't cause issues
- [ ] Rapid clicking doesn't create duplicates
- [ ] Simultaneous edits handled gracefully

## 📊 Data Integrity

### Database Operations
- [ ] Created products appear in database
- [ ] Updated products reflect changes in DB
- [ ] Deleted products removed from DB
- [ ] Order status updates persist
- [ ] User role changes persist
- [ ] Stock updates are accurate

### Calculations
- [ ] Revenue calculation is correct
- [ ] Order totals match item prices
- [ ] Stock counts accurate after updates
- [ ] Top products ranking correct

## 🎯 User Acceptance Testing

### Admin Workflows
- [ ] Can add a product from start to finish
- [ ] Can process an order through all statuses
- [ ] Can manage user accounts effectively
- [ ] Can find information quickly
- [ ] Can perform daily tasks efficiently

### Usability
- [ ] Interface is intuitive
- [ ] Actions are obvious
- [ ] Error messages are helpful
- [ ] Success feedback is clear
- [ ] Navigation makes sense

## 📝 Documentation Testing

### Help Text
- [ ] Tooltips display where needed
- [ ] Placeholder text is helpful
- [ ] Error messages are descriptive
- [ ] Success messages are clear

### External Docs
- [ ] README instructions work
- [ ] Setup guide is accurate
- [ ] API documentation matches implementation
- [ ] Screenshots match current UI

## ✅ Final Checks

### Production Readiness
- [ ] No console errors in production build
- [ ] No console warnings in production build
- [ ] Environment variables configured
- [ ] API endpoints use correct URLs
- [ ] HTTPS enabled (for production)
- [ ] CORS configured correctly
- [ ] Rate limiting enabled (recommended)

### Deployment
- [ ] Build process completes successfully
- [ ] Production build works locally
- [ ] Database migrations run successfully
- [ ] Admin user can be created in production
- [ ] All features work in production environment

## 🎉 Testing Complete!

Once all items are checked:
- [ ] Document any issues found
- [ ] Create tickets for bugs
- [ ] Plan enhancements based on feedback
- [ ] Celebrate successful implementation! 🎊

---

## 📋 Testing Notes Template

Use this template to document your testing:

```
Date: _______________
Tester: _______________
Environment: [ ] Local [ ] Staging [ ] Production

Issues Found:
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

Suggestions:
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

Overall Status: [ ] Pass [ ] Pass with Issues [ ] Fail

Notes:
_____________________________________________________
_____________________________________________________
_____________________________________________________
```

---

**Happy Testing!** 🧪✨
