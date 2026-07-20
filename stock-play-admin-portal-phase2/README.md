# Stock Play - Admin Portal

A professional, modern SaaS admin portal for stock management built with React.js.

## 🚀 Features

### Landing Page
- Modern gradient design inspired by TradeMaster
- Smooth animations and transitions
- Professional SaaS look and feel
- Responsive design

### Authentication
- Flexible login system (accepts any username/password)
- Automatic role assignment
- Protected routes

### Dashboard
- Interactive stat cards
- Click to view detailed tables
- Real-time data display
- Organizations, Licenses, and Users overview

### Organizations Management
- Create, Edit, Delete organizations
- Advanced filtering (Name, Status, Date range)
- Export to CSV
- Inline status updates
- View detailed organization information
- Organization details with tabs:
  - Organization Details (with inline editing)
  - License History
  - Authorized Users

### Users Management
- Add, Edit, Delete users
- Advanced filtering
- Inline row editing (single line edit mode)
- Save/Cancel functionality
- Status management

### UI/UX Features
- Clean white professional theme
- Smooth animations and transitions
- Iconoir icons
- Responsive design
- Modern card-based layouts
- Professional tables
- Status badges
- Advanced search and filters

## 📦 Installation

```bash
# Navigate to project directory
cd stock-play-admin

# Install dependencies
npm install

# Start development server
npm start
```

The application will open at [http://localhost:3000](http://localhost:3000)

## 🔐 Login

You can login with **ANY** username and password combination. For example:
- Username: admin
- Password: admin

## 📂 Project Structure

```
stock-play-admin/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── Sidebar.js
│   │   ├── Sidebar.css
│   │   ├── Navbar.js
│   │   └── Navbar.css
│   ├── context/
│   │   └── AppContext.js
│   ├── data/
│   │   └── mockData.js
│   ├── pages/
│   │   ├── Landing.js
│   │   ├── Landing.css
│   │   ├── Login.js
│   │   ├── Login.css
│   │   ├── Dashboard.js
│   │   ├── Dashboard.css
│   │   ├── Organizations.js
│   │   ├── Organizations.css
│   │   ├── OrganizationDetails.js
│   │   ├── OrganizationDetails.css
│   │   ├── Users.js
│   │   └── Users.css
│   ├── styles/
│   │   └── global.css
│   ├── App.js
│   ├── App.css
│   └── index.js
└── package.json
```

## 🎨 Design System

### Colors
- Primary: `#2563eb` (Blue)
- Success: `#10b981` (Green)
- Warning: `#f59e0b` (Amber)
- Danger: `#ef4444` (Red)
- Background: `#ffffff` (White)
- Secondary Background: `#f8fafc` (Light Gray)

### Features
- Professional white theme
- Smooth animations (fade-in, slide-in, scale)
- Modern shadows and borders
- Rounded corners
- Responsive design

## 🔄 Data Flow

- **React Context API** for global state management
- **Mock JSON data** for demonstration
- All CRUD operations update React state immediately
- No backend or database required
- Fully flexible and customizable

## 📱 Responsive

The application is fully responsive and works on:
- Desktop (1920px+)
- Laptop (1024px+)
- Tablet (768px+)
- Mobile (320px+)

## 🛠️ Technologies

- React 18
- React Router DOM 6
- Iconoir React Icons
- Pure CSS (No UI frameworks)
- Context API for state management

## 🎯 Key Functionalities

### Dashboard
- Total Organizations card → Shows organizations table
- Total Licenses card → Shows license distribution table
- Total Users card → Shows users overview table

### Organizations
- Advanced filters (Name, Status, Date range)
- Export to CSV
- Create new organizations
- View/Edit/Delete actions
- Organization details page with tabs
- Inline editing in details page

### Users
- Advanced filters (Name, Organization, Status, Date)
- Add new users
- Inline row editing (edit fields appear in same row)
- Save/Cancel buttons during edit
- Delete users

## 📝 Notes

- This is a **frontend-only** application
- All data is stored in **React state**
- Mock data is provided for demonstration
- Ready to connect to a backend API later
- Professional, human-crafted UI (not template-based)
- Investor and client-ready presentation

## 🚀 Production Build

```bash
npm run build
```

This creates an optimized production build in the `build` folder.

## 📄 License

This project is created for Stock Play Admin Portal.

---

**Built with ❤️ using React.js**
