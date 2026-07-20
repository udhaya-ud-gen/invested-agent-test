import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { 
  Plus, 
  Download, 
  Search, 
  Filter, 
  Trash,
  XmarkCircle 
} from 'iconoir-react';
import { sanitizeAlpha, sanitizeDigits } from '../utils/inputSanitizers';
import { STATE_OPTIONS, COUNTRY_OPTIONS } from '../utils/locationOptions';
import './Organizations.css';

const Organizations = () => {
  const { organizations, addOrganization, deleteOrganization } = useApp();
  const navigate = useNavigate();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [organizationToDelete, setOrganizationToDelete] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    name: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  });
  const [nameSortDirection, setNameSortDirection] = useState('asc');
  
  const [newOrg, setNewOrg] = useState({
    name: '',
    status: 'Active',
    address: {
      streetLine1: '',
      streetLine2: '',
      city: '',
      state: '',
      country: '',
      pincode: ''
    },
    contact: {
      primary: { phone: '', email: '' },
      secondary: { phone: '', email: '' }
    }
  });

  // Filtering logic
  const filteredOrganizations = organizations.filter(org => {
    const matchesSearch = org.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesName = !filters.name || org.name.toLowerCase().includes(filters.name.toLowerCase());
    const matchesStatus = !filters.status || org.status === filters.status;
    const matchesDateFrom = !filters.dateFrom || new Date(org.createdDate) >= new Date(filters.dateFrom);
    const matchesDateTo = !filters.dateTo || new Date(org.createdDate) <= new Date(filters.dateTo);
    
    return matchesSearch && matchesName && matchesStatus && matchesDateFrom && matchesDateTo;
  });

  const sortedOrganizations = useMemo(() => {
    const sorted = [...filteredOrganizations];
    sorted.sort((a, b) => {
      const aName = String(a.name || '').toLowerCase();
      const bName = String(b.name || '').toLowerCase();
      if (aName === bName) return 0;
      return nameSortDirection === 'asc'
        ? aName.localeCompare(bName)
        : bName.localeCompare(aName);
    });
    return sorted;
  }, [filteredOrganizations, nameSortDirection]);

  const handleCreate = async (e) => {
    e.preventDefault();
    
    // Set created date automatically to today's date
    const createdDate = new Date().toISOString().split('T')[0];
    
    const sanitizeContact = (c) => ({
      phone: c.phone || null,
      email: c.email || null,
    });
    await addOrganization({
      ...newOrg,
      createdDate: createdDate,
      contact: {
        primary: sanitizeContact(newOrg.contact.primary),
        secondary: sanitizeContact(newOrg.contact.secondary),
      }
    });
    setShowCreateModal(false);
    setNewOrg({
      name: '',
      status: 'Active',
      address: {
        streetLine1: '',
        streetLine2: '',
        city: '',
        state: '',
        country: '',
        pincode: ''
      },
      contact: {
        primary: { phone: '', email: '' },
        secondary: { phone: '', email: '' }
      }
    });
  };

  const isDateExpired = (dateString) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return date < now;
  };

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

  // Calculate organization metrics from DB license history for this table.
  const calculateOrgMetrics = (org) => {
    const licenses = org.licenseHistory || [];
    const users = org.authorizedUsers || [];
    const totalLicenses = licenses.reduce((sum, lic) => sum + (Number(lic.count) || 0), 0);
    const activeLicenseItems = licenses
      .filter((license) => license.status === 'Active' && !isDateExpired(license.expiryDate))
      .map((license) => ({
        ...license,
        count: Number(license.count) || 0
      }));
    const activeLicenses = activeLicenseItems.reduce((sum, license) => sum + license.count, 0);
    const activeLicenseIds = new Set(activeLicenseItems.map((license) => license.id));

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

      return licenses[0];
    };

    const seatEligibleUsers = users.filter((user) => {
      const statusExpired = String(user.status || '').toLowerCase() === 'expired';
      const userDateExpired = isDateExpired(user.expiryDate);
      if (statusExpired || userDateExpired) return false;

      const mappedLicense = getMappedLicenseForUser(user);
      if (!mappedLicense) return false;

      return activeLicenseIds.has(mappedLicense.id);
    });

    const authorizedUsers = users.filter(
      (user) => user.status === 'Invited' || user.status === 'Registered'
    ).length;
    const activeMobileUsers = seatEligibleUsers.filter(
      (user) => user.status === 'Active' || user.status === 'Registered'
    ).length;

    return { totalLicenses, activeLicenses, authorizedUsers, activeMobileUsers };
  };

  const handleExport = () => {
    const csv = [
      ['Organization Name', 'Created Date', 'Status', 'Total Licenses', 'Active Licenses', 'Authorized Users', 'Active Mobile Users'],
      ...filteredOrganizations.map(org => {
        const metrics = calculateOrgMetrics(org);
        return [
          org.name,
          org.createdDate,
          org.status,
          metrics.totalLicenses,
          metrics.activeLicenses,
          metrics.authorizedUsers,
          metrics.activeMobileUsers
        ];
      })
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `organizations-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleDelete = (organization) => {
    setOrganizationToDelete(organization);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setOrganizationToDelete(null);
  };

  const confirmDelete = async () => {
    if (!organizationToDelete?.id) return;
    await deleteOrganization(organizationToDelete.id);
    closeDeleteModal();
  };

  const clearFilters = () => {
    setFilters({
      name: '',
      status: '',
      dateFrom: '',
      dateTo: ''
    });
    setSearchTerm('');
  };

  return (
    <div className="organizations-page fade-in">
      <div className="page-header">
        <div className="page-title">
          <h2>Organization list</h2>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="search-bar">
          <Search width={20} height={20} strokeWidth={2} />
          <input
            type="text"
            placeholder="Search organizations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="toolbar-actions">
          <button 
            className={`btn btn-secondary ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter width={18} height={18} strokeWidth={2} />
            Filters
          </button>
          <button 
            className="btn btn-secondary"
            onClick={handleExport}
          >
            <Download width={18} height={18} strokeWidth={2} />
            Export
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus width={18} height={18} strokeWidth={2} />
            Create Organization
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="advanced-filters fade-in">
          <div className="filter-grid">
            <div className="input-group">
              <label>Organization Name</label>
              <input
                type="text"
                placeholder="Filter by name"
                value={filters.name}
                onChange={(e) => setFilters({ ...filters, name: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <option value="">All Status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="input-group">
              <label>Date From</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Date To</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              />
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
            <XmarkCircle width={16} height={16} strokeWidth={2} />
            Clear Filters
          </button>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th
                className="sortable-header"
                onClick={() => setNameSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                title={`Sort by Name (${nameSortDirection === 'asc' ? 'A to Z' : 'Z to A'})`}
              >
                Organization Name {nameSortDirection === 'asc' ? '↑' : '↓'}
              </th>
              <th>Created Date</th>
              <th>Status</th>
              <th className="metric-col">Total Licenses</th>
              <th className="metric-col">Active Licenses</th>
              <th className="metric-col">Authorized Users</th>
              <th className="metric-col">Active Mobile Users</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedOrganizations.map((org) => {
              const metrics = calculateOrgMetrics(org);
              return (
              <tr key={org.id} onClick={() => navigate(`/organizations/${org.id}`)}>
                <td><strong>{org.name}</strong></td>
                <td>{org.createdDate}</td>
                <td>
                  <span className={`status-badge status-${org.status.toLowerCase()}`}>
                    {org.status}
                  </span>
                </td>
                <td className="metric-col">{metrics.totalLicenses}</td>
                <td className="metric-col">{metrics.activeLicenses}</td>
                <td
                  className="metric-col"
                  style={{ color: metrics.authorizedUsers >= metrics.activeLicenses ? '#ef4444' : '#10b981', fontWeight: 'bold' }}
                >
                  {metrics.authorizedUsers}/{metrics.activeLicenses}
                </td>
                <td className="metric-col">{metrics.activeMobileUsers}</td>
                <td className="actions-col">
                  <div className="action-buttons">
                    <button
                      className="action-btn delete-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(org);
                      }}
                      title="Delete"
                    >
                      <Trash width={18} height={18} strokeWidth={2} />
                    </button>
                  </div>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
        {sortedOrganizations.length === 0 && (
          <div className="empty-state">
            <p>No organizations found</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay organizations-create-modal-overlay">
          <div className="modal organizations-create-modal">
            <div className="modal-header">
              <h2>Create Organization</h2>
              <button 
                className="modal-close"
                onClick={() => {
                  setShowCreateModal(false);
                  // Reset form state
                  setNewOrg({
                    name: '',
                    status: 'Active',
                    address: {
                      streetLine1: '',
                      streetLine2: '',
                      city: '',
                      state: '',
                      country: '',
                      pincode: ''
                    },
                    contact: {
                      primary: { phone: '', email: '' },
                      secondary: { phone: '', email: '' }
                    }
                  });
                }}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="input-group">
                <label>Organization Name *</label>
                <input
                  type="text"
                  required
                  value={newOrg.name}
                  onChange={(e) => setNewOrg({ ...newOrg, name: sanitizeAlpha(e.target.value) })}
                />
              </div>
              <div className="input-group">
                <label>Status *</label>
                <select
                  value={newOrg.status}
                  onChange={(e) => setNewOrg({ ...newOrg, status: e.target.value })}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              
              <div className="organizations-section-card">
                <h3>Address</h3>
                <div className="organizations-address-line-row">
                  <div className="input-group">
                    <label>Street Line 1</label>
                    <input
                      type="text"
                      value={newOrg.address.streetLine1}
                      onChange={(e) => setNewOrg({ ...newOrg, address: { ...newOrg.address, streetLine1: e.target.value } })}
                    />
                  </div>
                  <div className="input-group">
                    <label>Street Line 2</label>
                    <input
                      type="text"
                      value={newOrg.address.streetLine2}
                      onChange={(e) => setNewOrg({ ...newOrg, address: { ...newOrg.address, streetLine2: e.target.value } })}
                    />
                  </div>
                </div>
                <div className="organizations-address-grid">
                  <div className="input-group">
                    <label>City</label>
                    <input
                      type="text"
                      value={newOrg.address.city}
                      onChange={(e) => setNewOrg({ ...newOrg, address: { ...newOrg.address, city: e.target.value } })}
                    />
                  </div>
                  <div className="input-group">
                    <label>State</label>
                    <select
                      value={newOrg.address.state}
                      onChange={(e) => setNewOrg({ ...newOrg, address: { ...newOrg.address, state: e.target.value } })}
                    >
                      <option value="">Select State</option>
                      {STATE_OPTIONS.map((stateName) => (
                        <option key={stateName} value={stateName}>
                          {stateName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Country</label>
                    <select
                      value={newOrg.address.country}
                      onChange={(e) => setNewOrg({ ...newOrg, address: { ...newOrg.address, country: e.target.value } })}
                    >
                      <option value="">Select Country</option>
                      {COUNTRY_OPTIONS.map((countryName) => (
                        <option key={countryName} value={countryName}>
                          {countryName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Pincode</label>
                    <input
                      type="text"
                      value={newOrg.address.pincode}
                      onChange={(e) => setNewOrg({ ...newOrg, address: { ...newOrg.address, pincode: sanitizeDigits(e.target.value, 6) } })}
                    />
                  </div>
                </div>
              </div>

              <div className="organizations-section-card">
                <h3>Contact Details</h3>
                <div className="organizations-contact-grid">
                  <div className="organizations-contact-card">
                    <h4>Contact 1</h4>
                    <div className="input-group">
                      <label>Phone Number</label>
                      <input
                        type="tel"
                        value={newOrg.contact.primary.phone}
                        onChange={(e) => setNewOrg({ ...newOrg, contact: { ...newOrg.contact, primary: { ...newOrg.contact.primary, phone: sanitizeDigits(e.target.value, 10) } } })}
                      />
                    </div>
                    <div className="input-group">
                      <label>Email</label>
                      <input
                        type="email"
                        value={newOrg.contact.primary.email}
                        onChange={(e) => setNewOrg({ ...newOrg, contact: { ...newOrg.contact, primary: { ...newOrg.contact.primary, email: e.target.value } } })}
                      />
                    </div>
                  </div>

                  <div className="organizations-contact-card">
                    <h4>Contact 2</h4>
                    <div className="input-group">
                      <label>Phone Number</label>
                      <input
                        type="tel"
                        value={newOrg.contact.secondary.phone}
                        onChange={(e) => setNewOrg({ ...newOrg, contact: { ...newOrg.contact, secondary: { ...newOrg.contact.secondary, phone: sanitizeDigits(e.target.value, 10) } } })}
                      />
                    </div>
                    <div className="input-group">
                      <label>Email</label>
                      <input
                        type="email"
                        value={newOrg.contact.secondary.email}
                        onChange={(e) => setNewOrg({ ...newOrg, contact: { ...newOrg.contact, secondary: { ...newOrg.contact.secondary, email: e.target.value } } })}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateModal(false);
                    // Reset form state
                    setNewOrg({
                      name: '',
                      status: 'Active',
                      address: {
                        streetLine1: '',
                        streetLine2: '',
                        city: '',
                        state: '',
                        country: '',
                        pincode: ''
                      },
                      contact: {
                        primary: { phone: '', email: '' },
                        secondary: { phone: '', email: '' }
                      }
                    });
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay organizations-delete-modal-overlay" onClick={closeDeleteModal}>
          <div className="modal organizations-delete-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-content">
                <h2>Delete Organization</h2>
              </div>
              <button
                className="modal-close"
                onClick={closeDeleteModal}
                aria-label="Close delete confirmation"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="organizations-delete-modal-icon">!</div>
              <p className="organizations-delete-modal-message">
                Are you sure you want to delete this organization?
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeDeleteModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Organizations;
