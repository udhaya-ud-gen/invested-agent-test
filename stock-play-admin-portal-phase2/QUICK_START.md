# 🚀 Stock Play Admin Portal - Quick Start

## Installation (3 Commands)

```bash
cd stock-play-admin
npm install
npm start
```

## Login
- Username: **any text** (e.g., `admin`)
- Password: **any text** (e.g., `admin`)

## Features Overview

### 📊 Dashboard
- Click cards to view detailed tables
- Total Organizations → Organization list
- Total Licenses → License distribution
- Total Users → User overview

### 🏢 Organizations
- **Create** → Add new organization
- **Export** → Download CSV
- **Search** → Find organizations
- **Filters** → Advanced filtering (Name, Status, Date)
- **Actions** → View/Edit/Delete
- Click row → View organization details with tabs

### 👥 Users
- **Add User** → Create new user
- **Search** → Find users
- **Filters** → Advanced filtering
- **Edit** → Click pencil icon for inline editing
- **Save/Cancel** → Confirm or discard changes
- **Delete** → Remove user

### Navigation
- **Sidebar** → Dashboard, Organizations, Users
- **Navbar** → Profile dropdown with Logout
- **Active Menu** → Blue highlight on current page

## Key Features

✅ Fully flexible login (any credentials work)  
✅ Advanced filters on all pages  
✅ Inline editing for users  
✅ Export to CSV  
✅ Real-time updates  
✅ Professional white theme  
✅ Smooth animations  
✅ Fully responsive  

## Need Help?

See `INSTALLATION_GUIDE.md` for detailed instructions.

---

## MongoDB Connection

The backend loads `MONGODB_URI` from [server/.env](/e:/git/stock-play-admin-portal/server/.env).
Replace the placeholder value there with your real MongoDB connection string before starting the API.

```bash
cd server
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Built with React.js + FastAPI + MongoDB**
