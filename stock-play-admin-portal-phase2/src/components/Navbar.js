import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ProfileCircle, LogOut } from 'iconoir-react';
import './Navbar.css';

const Navbar = () => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const { currentUser, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  // Get page title based on current route
  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/dashboard')) return 'Dashboard';
    if (path.includes('/my-organization')) return 'My Organization';
    if (path.includes('/organizations')) return 'Organizations';
    if (path.includes('/users')) return 'Users';
    return 'Dashboard';
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <h1 className="page-title">{getPageTitle()}</h1>
      </div>
      
      <div className="navbar-right">
        <div className="user-info">
          <div className="user-name">{currentUser?.name || 'Admin'}</div>
          <div className="user-role">{currentUser?.roleDisplayName || currentUser?.role || 'Super Admin'}</div>
        </div>
        <div className="dropdown" ref={dropdownRef}>
          <button 
            className="profile-button"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <ProfileCircle width={24} height={24} strokeWidth={2} />
          </button>
          
          {showDropdown && (
            <div className="dropdown-menu">
              <div className="dropdown-header">
                <strong>{currentUser?.name || 'Admin'}</strong>
                <small>{currentUser?.email || 'admin@stockplay.com'}</small>
              </div>
              <button 
                className="dropdown-item"
                onClick={() => {
                  setShowDropdown(false);
                  // Navigate to profile if needed
                }}
              >
                <ProfileCircle width={18} height={18} strokeWidth={2} />
                Profile
              </button>
              <button 
                className="dropdown-item logout-item"
                onClick={handleLogout}
              >
                <LogOut width={18} height={18} strokeWidth={2} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
