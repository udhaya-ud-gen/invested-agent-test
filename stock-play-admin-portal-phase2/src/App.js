import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Organizations from './pages/Organizations';
import OrganizationDetails from './pages/OrganizationDetails';
import Users from './pages/Users';
import MyOrganization from './pages/MyOrganization';
import './styles/global.css';
import './App.css';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useApp();
  return isAuthenticated ? children : <Navigate to="/login" />;
};

// Restricts a route to (or away from) Org Admin users, redirecting to the
// appropriate landing page instead of showing content they shouldn't see.
const RoleGate = ({ children, requireOrgAdmin }) => {
  const { isOrgAdmin } = useApp();
  if (requireOrgAdmin && !isOrgAdmin) return <Navigate to="/dashboard" />;
  if (!requireOrgAdmin && isOrgAdmin) return <Navigate to="/my-organization" />;
  return children;
};

// Layout Component
const DashboardLayout = ({ children }) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  return (
    <div className="dashboard-layout">
      <Sidebar
        collapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed((prev) => !prev)}
      />
      <div className={`main-content ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <Navbar />
        <div className="content-wrapper">
          {children}
        </div>
      </div>
    </div>
  );
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <RoleGate requireOrgAdmin={false}>
              <DashboardLayout>
                <Dashboard />
              </DashboardLayout>
            </RoleGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/organizations"
        element={
          <ProtectedRoute>
            <RoleGate requireOrgAdmin={false}>
              <DashboardLayout>
                <Organizations />
              </DashboardLayout>
            </RoleGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/organizations/:id"
        element={
          <ProtectedRoute>
            <RoleGate requireOrgAdmin={false}>
              <DashboardLayout>
                <OrganizationDetails />
              </DashboardLayout>
            </RoleGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <RoleGate requireOrgAdmin={false}>
              <DashboardLayout>
                <Users />
              </DashboardLayout>
            </RoleGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-organization"
        element={
          <ProtectedRoute>
            <RoleGate requireOrgAdmin={true}>
              <DashboardLayout>
                <MyOrganization />
              </DashboardLayout>
            </RoleGate>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;
