import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import {
  createOrganization as apiCreateOrganization,
  createUser as apiCreateUser,
  deleteOrganization as apiDeleteOrganization,
  deleteUser as apiDeleteUser,
  getOrganizations,
  getOrganizationById,
  getRoles,
  getUsers,
  updateOrganization as apiUpdateOrganization,
  updateUser as apiUpdateUser,
  login as apiLogin
} from '../utils/api';

const isOrgAdminUser = (user) =>
  String(user?.roleKey || '').toLowerCase() === 'org_admin' ||
  String(user?.roleDisplayName || user?.role || '').trim().toLowerCase() === 'org admin';

const AppContext = createContext();

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const orgPollingInFlightRef = useRef(false);
  const normalizeDateYear = useCallback((value) => value, []);

  const normalizePortalUser = useCallback((user) => ({
    ...user,
    createdDate: normalizeDateYear(user.createdDate)
  }), [normalizeDateYear]);

  // Helper function to ensure all organizations have unique IDs for nested items
  const normalizeOrganization = useCallback((org) => {
    if (!org) return org;
    
    // Ensure authorized users have IDs
    const authorizedUsers = (org.authorizedUsers || []).map((user, index) => {
      const normalizedUser = {
        ...user,
        createdDate: normalizeDateYear(user.createdDate),
        expiryDate: normalizeDateYear(user.expiryDate),
        licenseAssignments: Array.isArray(user.licenseAssignments)
          ? user.licenseAssignments.map((assignment) => ({
              ...assignment,
              expiryDate: normalizeDateYear(assignment.expiryDate)
            }))
          : []
      };

      if (!user.id || user.id === 'undefined' || user.id === 'null') {
        return {
          ...normalizedUser,
          id: `auth-${user.email || 'unknown'}-${index}`
        };
      }
      return normalizedUser;
    });
    
    // Ensure license history items have IDs
    const licenseHistory = (org.licenseHistory || []).map((license, index) => {
      const normalizedLicense = {
        ...license,
        purchaseDate: normalizeDateYear(license.purchaseDate),
        expiryDate: normalizeDateYear(license.expiryDate)
      };

      if (!license.id || license.id === 'undefined' || license.id === 'null') {
        return {
          ...normalizedLicense,
          id: `lic-${normalizedLicense.purchaseDate || 'na'}-${normalizedLicense.expiryDate || 'na'}-${index}`
        };
      }
      return normalizedLicense;
    });
    
    return {
      ...org,
      createdDate: normalizeDateYear(org.createdDate),
      expiryDate: normalizeDateYear(org.expiryDate),
      authorizedUsers,
      licenseHistory
    };
  }, [normalizeDateYear]);

  // Initialize auth state from localStorage
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const saved = localStorage.getItem('isAuthenticated');
    return saved === 'true';
  });
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
  });
  const [organizations, setOrganizations] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);

  const fetchScopedOrganizations = useCallback(async (user) => {
    if (isOrgAdminUser(user) && user?.organizationId) {
      const org = await getOrganizationById(user.organizationId);
      return org ? [org] : [];
    }
    return getOrganizations();
  }, []);

  const refreshOrganizations = useCallback(async () => {
    const orgs = await fetchScopedOrganizations(currentUser);
    const normalizedOrgs = orgs.map(normalizeOrganization);
    setOrganizations(normalizedOrgs);
    return normalizedOrgs;
  }, [normalizeOrganization, fetchScopedOrganizations, currentUser]);

  useEffect(() => {
    let isMounted = true;

    const loadRolesSafely = async () => {
      try {
        return await getRoles();
      } catch (error) {
        console.warn('Failed to load roles, falling back to defaults', error);
        return [];
      }
    };

    const loadData = async () => {
      if (!isAuthenticated) return; // Only load data if authenticated
      
      try {
        const [orgs, userList, roleList] = await Promise.all([
          fetchScopedOrganizations(currentUser),
          getUsers(),
          loadRolesSafely()
        ]);
        if (isMounted) {
          // Normalize organizations to ensure they have proper IDs
          const normalizedOrgs = orgs.map(normalizeOrganization);
          setOrganizations(normalizedOrgs);
          setUsers(userList.map(normalizePortalUser));
          setRoles(roleList);

          // Keep navbar role label in sync when role display names change on backend.
          if (currentUser?.email) {
            const freshCurrentUser = userList.find((user) => user.email === currentUser.email);
            if (freshCurrentUser) {
              const syncedCurrentUser = {
                ...currentUser,
                role: freshCurrentUser.role,
                roleDisplayName: freshCurrentUser.roleDisplayName || freshCurrentUser.role
              };
              setCurrentUser(syncedCurrentUser);
              localStorage.setItem('currentUser', JSON.stringify(syncedCurrentUser));
            }
          }
        }
      } catch (error) {
        console.error('Failed to load data', error);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let isActive = true;
    const pollingIntervalMs = Number(process.env.REACT_APP_ORG_POLL_INTERVAL_MS || 10000);

    const pollOrganizations = async () => {
      if (!isActive || orgPollingInFlightRef.current) return;
      orgPollingInFlightRef.current = true;
      try {
        const orgs = await fetchScopedOrganizations(currentUser);
        if (!isActive) return;
        const normalizedOrgs = orgs.map(normalizeOrganization);
        setOrganizations(normalizedOrgs);
      } catch (error) {
        console.warn('Organization polling failed', error);
      } finally {
        orgPollingInFlightRef.current = false;
      }
    };

    const intervalId = setInterval(pollOrganizations, pollingIntervalMs);
    pollOrganizations();

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [isAuthenticated, normalizeOrganization]);

  const login = async (email, password) => {
    const user = await apiLogin(email, password);
    const userData = {
      name: user.name,
      role: user.role,
      roleKey: user.roleKey,
      roleDisplayName: user.roleDisplayName || user.role,
      email: user.email,
      organizationId: user.organizationId || null,
      organizationName: user.organizationName || null
    };
    setIsAuthenticated(true);
    setCurrentUser(userData);

    // Persist to localStorage
    localStorage.setItem('isAuthenticated', 'true');
    localStorage.setItem('currentUser', JSON.stringify(userData));

    return userData;
  };

  const logout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    
    // Clear localStorage
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('currentUser');
  };

  const addOrganization = async (org) => {
    const newOrg = await apiCreateOrganization(org);
    const normalizedOrg = normalizeOrganization(newOrg);
    setOrganizations(prev => [...prev, normalizedOrg]);
    return normalizedOrg;
  };

  const updateOrganization = async (id, updatedData) => {
    const updated = await apiUpdateOrganization(id, updatedData);
    const normalizedUpdated = normalizeOrganization(updated);
    setOrganizations(prev => prev.map(org =>
      org.id === id ? { ...org, ...normalizedUpdated } : org
    ));
    return normalizedUpdated;
  };

  const deleteOrganization = async (id) => {
    await apiDeleteOrganization(id);
    setOrganizations(prev => prev.filter(org => org.id !== id));
  };

  const addUser = async (user) => {
    const { confirmPassword, ...payload } = user;
    const newUser = await apiCreateUser(payload);
    const normalizedUser = normalizePortalUser(newUser);
    setUsers(prev => [...prev, normalizedUser]);
    return normalizedUser;
  };

  const updateUser = async (id, updatedData) => {
    const updated = await apiUpdateUser(id, updatedData);
    const normalizedUser = normalizePortalUser(updated);
    setUsers(prev => prev.map(user =>
      user.id === id ? { ...user, ...normalizedUser } : user
    ));
    return normalizedUser;
  };

  const deleteUser = async (id) => {
    await apiDeleteUser(id);
    setUsers(prev => prev.filter(user => user.id !== id));
  };

  const value = {
    isAuthenticated,
    currentUser,
    isOrgAdmin: isOrgAdminUser(currentUser),
    organizations,
    users,
    roles,
    refreshOrganizations,
    login,
    logout,
    addOrganization,
    updateOrganization,
    deleteOrganization,
    addUser,
    updateUser,
    deleteUser
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
