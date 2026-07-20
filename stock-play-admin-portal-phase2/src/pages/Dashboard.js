import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Building, CreditCard, UserCircle, XmarkCircle, Search } from 'iconoir-react';
import './Dashboard.css';

const Dashboard = () => {
  const { organizations, refreshOrganizations } = useApp();
  const [activeView, setActiveView] = useState(null);
  const [nameSortDirection, setNameSortDirection] = useState('asc');
  const [tableSearchTerm, setTableSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    refreshOrganizations().catch((error) => {
      console.error('Failed to refresh organizations on dashboard', error);
    });
  }, [refreshOrganizations]);

  const toCanonicalDate = (dateValue) => {
    if (!dateValue) return '';
    const raw = String(dateValue).trim();
    const directMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directMatch) return directMatch[1];
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const sameCalendarDate = (left, right) => {
    const l = toCanonicalDate(left);
    const r = toCanonicalDate(right);
    return Boolean(l && r && l === r);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isDateExpired = (dateValue) => {
    const canonical = toCanonicalDate(dateValue);
    if (!canonical) return false;
    const parsed = new Date(canonical);
    if (Number.isNaN(parsed.getTime())) return false;
    parsed.setHours(0, 0, 0, 0);
    return parsed < today;
  };

  const totalOrganizations = organizations.length;
  const getTotalLicenseCountForOrg = (org) =>
    (org.licenseHistory || [])
      .reduce((licenseSum, license) => licenseSum + (Number(license.count) || 0), 0);

  const getActiveLicenseCountForOrg = (org) =>
    (org.licenseHistory || [])
      .filter((license) => !isDateExpired(license.expiryDate) && license.status === 'Active')
      .reduce((licenseSum, license) => licenseSum + (Number(license.count) || 0), 0);

  const totalLicenses = organizations.reduce(
    (sum, org) => sum + getTotalLicenseCountForOrg(org),
    0
  );
  const totalActiveLicenses = organizations.reduce(
    (sum, org) => sum + getActiveLicenseCountForOrg(org),
    0
  );

  const allAuthorizedUsers = organizations.flatMap((org) => {
    const licenses = org.licenseHistory || [];
    const singleLicense = licenses.length === 1 ? licenses[0] : null;
    const getMappedLicenseForUser = (user) => {
      if (!licenses.length) return null;

      const matchedById = user.licenseId
        ? licenses.find((license) => license.id === user.licenseId)
        : null;
      if (matchedById) return matchedById;

      const matchedByExpiry = licenses.find((license) =>
        sameCalendarDate(license.expiryDate, user.expiryDate)
      );
      if (matchedByExpiry) return matchedByExpiry;

      const userCreatedDate = toCanonicalDate(user.createdDate);
      let fallbackLicense = null;
      let fallbackPurchaseDate = '';
      licenses.forEach((license) => {
        const purchaseDate = toCanonicalDate(license.purchaseDate);
        if (!purchaseDate) {
          if (!fallbackLicense) fallbackLicense = license;
          return;
        }
        if (!userCreatedDate || purchaseDate <= userCreatedDate) {
          if (!fallbackLicense || purchaseDate > fallbackPurchaseDate) {
            fallbackLicense = license;
            fallbackPurchaseDate = purchaseDate;
          }
        }
      });

      return fallbackLicense || licenses[0];
    };

    const expiredLicenseIds = new Set(
      licenses
        .filter((license) => String(license.status || '').toLowerCase() === 'expired')
        .map((license) => license.id)
    );

    const resolveLicenseCode = (user) => getMappedLicenseForUser(user)?.licenseCode || '-';

    const getStatusFromDb = (user) => String(user.status || '').trim();
    const isUserExpired = (user) => {
      const statusExpired = getStatusFromDb(user).toLowerCase() === 'expired';
      const userDateExpired = isDateExpired(user.expiryDate);
      const mappedLicense = getMappedLicenseForUser(user);
      const mappedLicenseExpired = Boolean(
        mappedLicense &&
        (expiredLicenseIds.has(mappedLicense.id) || isDateExpired(mappedLicense.expiryDate))
      );
      const singleExpiredLicense = Boolean(
        singleLicense && String(singleLicense.status || '').toLowerCase() === 'expired'
      );
      return statusExpired || userDateExpired || mappedLicenseExpired || singleExpiredLicense;
    };

    return (org.authorizedUsers || []).map((user, index) => ({
      ...user,
      id: user.id || `${org.id || org.name || 'org'}-${user.email || index}`,
      organizationName: org.name,
      licenseCode: resolveLicenseCode(user),
      effectiveStatus: getStatusFromDb(user),
      isExpired: isUserExpired(user)
    }));
  });
  const totalInvitedUsers = allAuthorizedUsers.filter((user) => user.effectiveStatus.toLowerCase() === 'invited').length;
  const totalRegisteredUsers = allAuthorizedUsers.filter(
    (user) => user.effectiveStatus.toLowerCase() === 'registered' && !user.isExpired
  ).length;
  const totalExpiredUsers = allAuthorizedUsers.filter((user) => user.isExpired).length;

  const stats = [
    {
      id: 'organizations',
      title: 'Total Organizations',
      description: 'View and manage all organizations',
      value: totalOrganizations,
      contentClassName: 'organizations-stat-content',
      icon: Building,
      color: '#3b82f6',
      bgColor: '#dbeafe'
    },
    {
      id: 'licenses',
      title: 'Total Licenses',
      description: 'Track all licenses across orgs',
      value: totalLicenses,
      icon: CreditCard,
      color: '#7c3aed',
      bgColor: '#ede9fe'
    },
    {
      id: 'active-licenses',
      title: 'Total Active Licenses',
      description: 'Track active licenses across orgs',
      value: totalActiveLicenses,
      icon: CreditCard,
      color: '#8b5cf6',
      bgColor: '#ede9fe'
    },
    {
      id: 'invited-users',
      title: 'Total Invited Users',
      description: 'Pending invite acceptance',
      value: totalInvitedUsers,
      icon: UserCircle,
      color: '#0ea5e9',
      bgColor: '#e0f2fe'
    },
    {
      id: 'registered-users',
      title: 'Total Registered Users',
      description: 'Users who completed signup',
      value: totalRegisteredUsers,
      icon: UserCircle,
      color: '#10b981',
      bgColor: '#d1fae5'
    },
    {
      id: 'expired-users',
      title: 'Total Expired Users',
      description: 'Users with expired access',
      value: totalExpiredUsers,
      icon: UserCircle,
      color: '#ef4444',
      bgColor: '#fee2e2'
    }
  ];

  const getTableData = () => {
    switch (activeView) {
      case 'organizations':
        return {
          title: 'Organizations Overview',
          headers: ['Organization Name', 'User Count'],
          rows: organizations.map(org => ({
            id: org.id,
            searchText: `${org.name || ''} ${(org.authorizedUsers || []).length}`,
            cells: [org.name, (org.authorizedUsers || []).length]
          }))
        };
      case 'active-licenses':
        return {
          title: 'Active License Distribution',
          headers: ['Organization Name', 'License Count'],
          rows: organizations
            .map((org) => ({
              id: org.id,
              activeLicenseCount: getActiveLicenseCountForOrg(org),
              searchText: `${org.name || ''} ${getActiveLicenseCountForOrg(org)}`,
              cells: [org.name, getActiveLicenseCountForOrg(org)]
            }))
            .filter((row) => row.activeLicenseCount > 0)
        };
      case 'licenses':
        return {
          title: 'License Distribution',
          headers: ['Organization Name', 'License Count'],
          rows: organizations.map(org => ({
            id: org.id,
            searchText: `${org.name || ''} ${getTotalLicenseCountForOrg(org)}`,
            cells: [
              org.name,
              getTotalLicenseCountForOrg(org)
            ]
          }))
        };
      case 'invited-users':
        return {
          title: 'Invited Users Overview',
          headers: ['User Name', 'License ID', 'Organization', 'Status'],
          rows: allAuthorizedUsers
            .filter((user) => user.effectiveStatus.toLowerCase() === 'invited')
            .map((user) => ({
              id: user.id,
              searchText: `${user.name || ''} ${user.licenseCode || ''} ${user.organizationName || ''} ${user.effectiveStatus || ''}`,
              cells: [
                user.name || '-',
                user.licenseCode || '-',
                user.organizationName || '-',
                <span className={`status-badge status-${String(user.effectiveStatus).toLowerCase()}`}>
                  {user.effectiveStatus}
                </span>
              ]
            }))
        };
      case 'registered-users':
        return {
          title: 'Registered Users Overview',
          headers: ['User Name', 'License ID', 'Organization', 'Status'],
          rows: allAuthorizedUsers
            .filter((user) => user.effectiveStatus.toLowerCase() === 'registered' && !user.isExpired)
            .map((user) => ({
              id: user.id,
              searchText: `${user.name || ''} ${user.licenseCode || ''} ${user.organizationName || ''} ${user.effectiveStatus || ''}`,
              cells: [
                user.name || '-',
                user.licenseCode || '-',
                user.organizationName || '-',
                <span className={`status-badge status-${String(user.effectiveStatus).toLowerCase()}`}>
                  {user.effectiveStatus}
                </span>
              ]
            }))
        };
      case 'expired-users':
        return {
          title: 'Expired Users Overview',
          headers: ['User Name', 'License ID', 'Organization', 'Status'],
          rows: allAuthorizedUsers
            .filter((user) => user.isExpired)
            .map((user) => ({
            id: user.id,
            searchText: `${user.name || ''} ${user.licenseCode || ''} ${user.organizationName || ''} Expired`,
            cells: [
              user.name || '-',
              user.licenseCode || '-',
              user.organizationName || '-',
              <span className="status-badge status-expired">
                Expired
              </span>
            ]
          }))
        };
      default:
        return null;
    }
  };

  const tableData = getTableData();
  const showDashboardTableSearch = Boolean(tableData && activeView && activeView !== 'organizations');
  const filteredTableRows = tableData
    ? tableData.rows.filter((row) => {
        if (!showDashboardTableSearch || !tableSearchTerm.trim()) return true;
        const searchText = String(
          row.searchText || (row.cells || []).map((cell) => String(cell)).join(' ')
        ).toLowerCase();
        return searchText.includes(tableSearchTerm.trim().toLowerCase());
      })
    : [];
  const sortedTableRows = tableData
    ? [...filteredTableRows].sort((a, b) => {
        const aName = String(a.cells[0] || '').toLowerCase();
        const bName = String(b.cells[0] || '').toLowerCase();
        if (aName === bName) return 0;
        return nameSortDirection === 'asc'
          ? aName.localeCompare(bName)
          : bName.localeCompare(aName);
      })
    : [];

  return (
    <div className="dashboard-page fade-in">
      <div className="dashboard-grid">
        {stats.map((stat) => (
          <div
            key={stat.id}
            className="stat-card"
            onClick={() => {
              if (stat.id === 'organizations') {
                navigate('/organizations');
                return;
              }
              setActiveView(stat.id);
              setTableSearchTerm('');
            }}
          >
            <div className="stat-icon" style={{ 
              backgroundColor: stat.bgColor,
              color: stat.color 
            }}>
              <stat.icon width={28} height={28} strokeWidth={2} />
            </div>
            <div className={`stat-content ${stat.contentClassName || ''}`}>
              <p className="stat-label">{stat.title}</p>
              <p className="stat-description">{stat.description}</p>
              <h3 className="stat-value">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {tableData && (
        <div className="dashboard-table-section fade-in">
          <div className="table-header">
            <h2>{tableData.title}</h2>
            <div className="table-header-actions">
              {showDashboardTableSearch && (
                <div className="dashboard-table-search">
                  <Search width={20} height={20} strokeWidth={2} />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={tableSearchTerm}
                    onChange={(e) => setTableSearchTerm(e.target.value)}
                  />
                </div>
              )}
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setActiveView(null);
                  setTableSearchTerm('');
                }}
              >
                <XmarkCircle width={16} height={16} strokeWidth={2} />
                Close
              </button>
            </div>
          </div>
          
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  {tableData.headers.map((header, index) => {
                    const isNameHeader = index === 0 && String(header).toLowerCase().includes('name');
                    if (!isNameHeader) {
                      return <th key={index}>{header}</th>;
                    }
                    return (
                      <th
                        key={index}
                        className="sortable-header"
                        onClick={() => setNameSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                        title={`Sort by Name (${nameSortDirection === 'asc' ? 'A to Z' : 'Z to A'})`}
                      >
                        {header} {nameSortDirection === 'asc' ? '↑' : '↓'}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedTableRows.map((row) => (
                  <tr key={row.id}>
                    {row.cells.map((cell, index) => (
                      <td key={index}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
