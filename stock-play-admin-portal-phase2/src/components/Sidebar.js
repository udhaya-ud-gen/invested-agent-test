import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Dashboard as DashboardIcon,
  Building,
  UserCircle,
  NavArrowLeft
} from 'iconoir-react';
import { useApp } from '../context/AppContext';
import brandLogo from '../logoimage.png';
import './Sidebar.css';

const Sidebar = ({ collapsed, onToggle }) => {
  const { isOrgAdmin } = useApp();
  const menuItems = isOrgAdmin
    ? [{ path: '/my-organization', icon: Building, label: 'My Organization' }]
    : [
        { path: '/dashboard', icon: DashboardIcon, label: 'Dashboard' },
        { path: '/organizations', icon: Building, label: 'Organizations' },
        { path: '/users', icon: UserCircle, label: 'Users' }
      ];

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {collapsed ? (
          <button
            type="button"
            className="menu-toggle logo-toggle"
            onClick={onToggle}
            aria-label="Open menu"
          >
            <img src={brandLogo} alt="InvestEd logo" className="sidebar-logo-mascot" />
          </button>
        ) : (
          <>
            <div className="brand">
              <img src={brandLogo} alt="InvestEd logo" className="sidebar-logo-website" />
              <span className="sidebar-brand-text" aria-label="InvestEd">
                <span className="sidebar-brand-primary">Invest</span>
                <span className="sidebar-brand-accent">Ed</span>
              </span>
            </div>
            <button
              type="button"
              className="menu-toggle close-toggle"
              onClick={onToggle}
              aria-label="Close menu"
            >
              <NavArrowLeft width={22} height={22} strokeWidth={2} />
            </button>
          </>
        )}
      </div>
      
      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => 
              `sidebar-item ${isActive ? 'active' : ''}`
            }
            title={collapsed ? item.label : ''}
          >
            <item.icon width={20} height={20} strokeWidth={2} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
