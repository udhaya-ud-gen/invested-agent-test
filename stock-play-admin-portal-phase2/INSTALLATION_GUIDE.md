# Stock Play Admin Portal - Installation & Setup Guide

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (version 14.x or higher)
- **npm** (version 6.x or higher)

To check if you have Node.js and npm installed:
```bash
node --version
npm --version
```

## 🚀 Quick Start (3 Simple Steps)

### Step 1: Navigate to Project Directory
```bash
cd stock-play-admin
```

### Step 2: Install Dependencies
```bash
npm install
```

This will install all required packages:
- react
- react-dom
- react-router-dom
- iconoir-react
- react-scripts

### Step 3: Start Development Server
```bash
npm start
```

The application will automatically open in your browser at:
**http://localhost:3000**

## 🔐 First Login

1. You'll see the landing page with a gradient background
2. Click "Login" or "Get Started"
3. Enter **ANY** username and password (no restrictions!)
   - Example: Username: `admin`, Password: `admin`
   - Example: Username: `test`, Password: `test`
4. You'll be automatically redirected to the Dashboard

## 📱 Application Features

### Landing Page
- Professional gradient design
- Animated hero section
- Feature cards
- Login button (white with shadow)

### Dashboard (After Login)
- **Total Organizations Card** - Click to view organizations table
- **Total Licenses Card** - Click to view license distribution
- **Total Users Card** - Click to view users overview

### Left Sidebar Navigation
- Dashboard (Home icon)
- Organizations (Building icon)
- Users (User icon)
- Active menu highlights in blue

### Top Navbar
- Dynamic page title (changes with navigation)
- Profile icon (right side)
- Click profile icon for dropdown:
  - Profile
  - Logout

### Organizations Page
- **Create Organization** button - Opens modal to add new org
- **Export** button - Downloads CSV file
- **Search bar** - Search organizations
- **Filters button** - Shows advanced filters:
  - Filter by Name
  - Filter by Status (Active/Deactive/Pending/Expired)
  - Filter by Date range
- **Table Actions**:
  - **View** (Eye icon) - Opens organization details
  - **Edit** (Pencil icon) - Opens organization details
  - **Delete** (Trash icon) - Deletes organization

### Organization Details Page
- **Back button** - Returns to organizations list
- **Three Tabs**:
  1. **Organization Details** - View and edit all org info
  2. **License History** - View license records in table
  3. **Authorized Users** - View users in table
- **Edit Mode**: Click "Edit Organization" to modify details
- **Save/Cancel** buttons appear during editing

### Users Page
- **Add User** button - Opens modal to add new user
- **Search bar** - Search users
- **Filters button** - Shows advanced filters:
  - Filter by Name
  - Filter by Organization
  - Filter by Status
  - Filter by Date range
- **Inline Editing**:
  - Click **Edit** icon (pencil)
  - Input fields appear **in the same row**
  - Modify: Name, Organization, License Expiry, Status
  - Click **Save** (checkmark) or **Cancel** (X)
- **Delete** - Removes user

## 🎨 UI Highlights

### Professional Design Elements
- Clean white theme
- Smooth fade-in animations
- Hover effects on all interactive elements
- Modern rounded cards
- Professional shadows
- Status badges (color-coded)
- Responsive tables

### Status Colors
- **Active** - Green background
- **Deactive** - Red background
- **Pending** - Yellow background
- **Expired** - Gray background

## 🔧 Advanced Features

### Advanced Filtering
All filters work together:
1. Click **Filters** button
2. Enter filter criteria
3. Results update automatically
4. Click **Clear Filters** to reset

### Export Functionality
- Exports filtered data to CSV
- Includes all visible columns
- Downloads automatically
- Filename includes current date

### Inline Editing (Users Page)
1. Click Edit icon on any user row
2. Fields become editable **in the same row**
3. Make changes
4. Click Save to confirm or Cancel to discard

### Organization Details Editing
1. Navigate to organization details
2. Click "Edit Organization"
3. All fields become editable
4. Click "Save Changes" or "Cancel"
5. Status dropdown updates everywhere

## 📊 Mock Data Included

The application comes with:
- 6 Organizations
- 10 Users
- Various license records
- Different statuses for demonstration

## 🛠️ Available Scripts

### Development
```bash
npm start
```
Runs the app in development mode

### Production Build
```bash
npm run build
```
Builds the app for production to the `build` folder

### Testing
```bash
npm test
```
Launches the test runner

## 🌐 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## 📱 Responsive Breakpoints

- **Mobile**: 320px - 767px (Sidebar collapses to icons only)
- **Tablet**: 768px - 1023px
- **Desktop**: 1024px+

## ⚙️ Troubleshooting

### Port 3000 Already in Use
```bash
# Kill the process using port 3000
# On Mac/Linux:
lsof -ti:3000 | xargs kill

# On Windows:
netstat -ano | findstr :3000
taskkill /PID [PID_NUMBER] /F

# Or specify a different port:
PORT=3001 npm start
```

### Dependencies Not Installing
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### Application Not Starting
```bash
# Make sure you're in the correct directory
cd stock-play-admin

# Verify Node.js version
node --version  # Should be 14.x or higher

# Try cleaning and reinstalling
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
npm start
```

## 🎯 Next Steps

After installation, you can:
1. **Customize**: Modify colors, styling, and branding
2. **Extend**: Add more features and pages
3. **Connect Backend**: Replace mock data with API calls
4. **Deploy**: Build and deploy to production

## 📞 Support

For issues or questions:
1. Check this guide
2. Review the README.md
3. Check browser console for errors
4. Verify all dependencies are installed

## ✅ Success Checklist

- [ ] Node.js installed
- [ ] npm installed
- [ ] Dependencies installed (`npm install`)
- [ ] Development server running (`npm start`)
- [ ] Application opens in browser
- [ ] Can login with any credentials
- [ ] Dashboard displays correctly
- [ ] Can navigate between pages
- [ ] Can create/edit/delete organizations
- [ ] Can add/edit/delete users
- [ ] Filters work correctly
- [ ] Export works

---

**Congratulations! Your Stock Play Admin Portal is ready to use! 🎉**
