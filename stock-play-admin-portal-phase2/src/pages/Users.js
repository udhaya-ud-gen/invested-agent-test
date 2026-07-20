import React, { useMemo, useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import * as XLSX from 'xlsx';
import {
  Plus,
  Search,
  Filter,
  Download,
  EditPencil,
  Trash,
  // Key, // Temporarily disabled with Reset Password action button
  XmarkCircle,
  Import
} from 'iconoir-react';
import * as api from '../utils/api';
import { sanitizeAlpha } from '../utils/inputSanitizers';
import './Users.css';

const Users = () => {
  const { users, roles, addUser, updateUser, deleteUser } = useApp();
  const fileInputRef = useRef(null);
  const roleOptions = (roles || [])
    .filter((role) => role.isActive !== false)
    .map((role) => role.displayName)
    .filter(Boolean)
    .filter((name) => name.trim().toLowerCase() !== 'org admin');
  const fallbackRoles = ['Super Admin', 'Sales Admin'];
  const availableRoleOptions = roleOptions.length ? roleOptions : fallbackRoles;

  const isOrgAdminUser = (user) =>
    String(user.roleKey || '').toLowerCase() === 'org_admin' ||
    String(user.role || '').trim().toLowerCase() === 'org admin';
  const portalUsers = (users || []).filter((user) => !isOrgAdminUser(user));

  const [showAddModal, setShowAddModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUserId, setEditingUserId] = useState(null);
  const [editedUser, setEditedUser] = useState(null);
  const [nameSortDirection, setNameSortDirection] = useState('asc');
  const [filters, setFilters] = useState({
    name: '',
    role: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  });

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    expiryDate: '',
    role: availableRoleOptions[0],
    status: 'Active'
  });
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState(null);
  const [resetPasswordForm, setResetPasswordForm] = useState({
    password: '',
    confirmPassword: ''
  });
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const [alertModal, setAlertModal] = useState({ show: false, type: '', title: '', message: '', details: [] });
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', targetId: null });

  const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

  const showAlert = (type, message, details = []) => {
    setAlertModal({ show: true, type, title: 'InvestEd Admin', message, details });
  };

  const closeAlert = () => {
    setAlertModal({ show: false, type: '', title: '', message: '', details: [] });
  };

  const openConfirmModal = (title, message, targetId) => {
    setConfirmModal({ show: true, title, message, targetId });
  };

  const closeConfirmModal = () => {
    setConfirmModal({ show: false, title: '', message: '', targetId: null });
  };

  // Filtering logic
  const filteredUsers = portalUsers.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesName = !filters.name || user.name.toLowerCase().includes(filters.name.toLowerCase());
    const matchesRole = !filters.role || user.role === filters.role;
    const matchesStatus = !filters.status || user.status === filters.status;
    const matchesDateFrom = !filters.dateFrom || new Date(user.createdDate) >= new Date(filters.dateFrom);
    const matchesDateTo = !filters.dateTo || new Date(user.createdDate) <= new Date(filters.dateTo);

    return matchesSearch && matchesName && matchesRole && matchesStatus && matchesDateFrom && matchesDateTo;
  });

  const sortedUsers = useMemo(() => {
    const sorted = [...filteredUsers];
    sorted.sort((a, b) => {
      const aName = String(a.name || '').toLowerCase();
      const bName = String(b.name || '').toLowerCase();
      if (aName === bName) return 0;
      return nameSortDirection === 'asc'
        ? aName.localeCompare(bName)
        : bName.localeCompare(aName);
    });
    return sorted;
  }, [filteredUsers, nameSortDirection]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (newUser.password !== newUser.confirmPassword) {
      showAlert('error', 'Passwords do not match.');
      return;
    }

    const emailCanonical = normalizeEmail(newUser.email);
    const existingEmail = (users || []).some((user) => normalizeEmail(user.email) === emailCanonical);
    if (emailCanonical && existingEmail) {
      showAlert('error', 'This email already exists.');
      return;
    }

    try {
      // Add created date automatically as today's date
      const userWithCreatedDate = {
        ...newUser,
        email: String(newUser.email || '').trim(),
        createdDate: new Date().toISOString().split('T')[0]
      };
      await addUser(userWithCreatedDate);
      setShowAddModal(false);
      setNewUser({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        expiryDate: '',
        role: availableRoleOptions[0],
        status: 'Active'
      });
      showAlert('success', 'User created successfully.');
    } catch (error) {
      showAlert('error', `Unable to create user. ${error.message || ''}`.trim());
    }
  };

  const handleEdit = (user) => {
    setEditingUserId(user.id);
    setEditedUser({ ...user });
  };

  const handleSave = async () => {
    try {
      const emailCanonical = normalizeEmail(editedUser?.email);
      const existingEmail = (users || []).some(
        (user) => user.id !== editingUserId && normalizeEmail(user.email) === emailCanonical
      );
      if (emailCanonical && existingEmail) {
        showAlert('error', 'This email already exists.');
        return;
      }
      await updateUser(editingUserId, {
        ...editedUser,
        email: String(editedUser?.email || '').trim()
      });
      setEditingUserId(null);
      setEditedUser(null);
      showAlert('success', 'User updated successfully.');
    } catch (error) {
      showAlert('error', `Unable to update user. ${error.message || ''}`.trim());
    }
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditedUser(null);
  };

  const handleDelete = async (id) => {
    try {
      await deleteUser(id);
      closeConfirmModal();
      showAlert('success', 'User deleted successfully.');
    } catch (error) {
      showAlert('error', `Unable to delete user. ${error.message || ''}`.trim());
    }
  };

  const requestDelete = (id) => {
    openConfirmModal('Delete User', 'Are you sure you want to delete this user?', id);
  };

  const handleConfirmDelete = async () => {
    if (!confirmModal.targetId) return;
    await handleDelete(confirmModal.targetId);
  };

  const handleOpenResetModal = (user) => {
    setResetTargetUser(user);
    setResetPasswordForm({
      password: '',
      confirmPassword: ''
    });
    setShowResetModal(true);
  };

  const handleCloseResetModal = () => {
    setShowResetModal(false);
    setResetTargetUser(null);
    setResetPasswordForm({
      password: '',
      confirmPassword: ''
    });
    setResetSubmitting(false);
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();

    if (!resetTargetUser?.id) {
      showAlert('error', 'Unable to identify selected user.');
      return;
    }

    if (!resetPasswordForm.password || !resetPasswordForm.confirmPassword) {
      showAlert('error', 'Please enter and confirm the new password.');
      return;
    }

    if (resetPasswordForm.password !== resetPasswordForm.confirmPassword) {
      showAlert('error', 'Passwords do not match.');
      return;
    }

    try {
      setResetSubmitting(true);
      const response = await api.sendPasswordResetEmail(resetTargetUser.id, {
        password: resetPasswordForm.password,
        confirmPassword: resetPasswordForm.confirmPassword
      });
      handleCloseResetModal();
      if (response?.emailSent) {
        showAlert('success', response.message || `Password updated. Confirmation email sent to ${resetTargetUser.email}.`);
      } else {
        showAlert('warning', response?.message || `Password updated, but confirmation email could not be sent to ${resetTargetUser.email}.`);
      }
    } catch (error) {
      showAlert('error', 'Password reset failed. Please try again.');
    } finally {
      setResetSubmitting(false);
    }
  };

  const clearFilters = () => {
    setFilters({
      name: '',
      role: '',
      status: '',
      dateFrom: '',
      dateTo: ''
    });
    setSearchTerm('');
  };

  const handleExport = () => {
    const csv = [
      ['Name', 'Email', 'Role', 'Created Date', 'Status'],
      ...filteredUsers.map(user => [
        user.name,
        user.email,
        user.role,
        user.createdDate,
        user.status
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portal-users-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleImportChange = (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    const isExcel = /\.(xls|xlsx)$/i.test(file.name);
    if (!isExcel) {
      showAlert('warning', 'Please upload an Excel file (.xls or .xlsx)');
      event.target.value = '';
      return;
    }

    // Read and parse Excel file
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Get first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          showAlert('warning', 'Excel file is empty. Please add data and try again.');
          event.target.value = '';
          return;
        }

        // Parse users from Excel
        // Expected columns: Name, Email, Password, Role, Status, Created Date
        const importedUsers = jsonData.map((row) => ({
          name: row['Name'] || row['name'] || row['NAME'] || '',
          email: row['Email'] || row['email'] || row['EMAIL'] || row['E-mail'] || row['e-mail'] || '',
          password: row['Password'] || row['password'] || row['PASSWORD'] || 'default123',
          role: row['Role'] || row['role'] || row['ROLE'] || 'Super Admin',
          status: row['Status'] || row['status'] || row['STATUS'] || 'Active',
          createdDate: row['Created Date'] || row['created date'] || row['createdDate'] || row['CreatedDate'] || new Date().toISOString().split('T')[0]
        })).filter(user => user.name && user.email); // Only import rows with name and email

        if (importedUsers.length === 0) {
          const foundColumns = jsonData[0] ? Object.keys(jsonData[0]).join(', ') : 'none';
          showAlert('warning', 'No valid users found in Excel file.', [
            'Required: Name and Email columns',
            `Columns found in your file: ${foundColumns}`,
            'Please ensure your Excel has at least "Name" and "Email" columns.'
          ]);
          event.target.value = '';
          return;
        }

        const existingEmailSet = new Set((users || []).map((user) => normalizeEmail(user.email)));
        const seenImportEmails = new Set();
        const duplicates = [];
        const readyToImport = [];

        for (const user of importedUsers) {
          const emailCanonical = normalizeEmail(user.email);
          if (!emailCanonical) continue;

          if (existingEmailSet.has(emailCanonical)) {
            duplicates.push({ email: user.email, reason: 'Already exists' });
            continue;
          }
          if (seenImportEmails.has(emailCanonical)) {
            duplicates.push({ email: user.email, reason: 'Duplicate in file' });
            continue;
          }

          seenImportEmails.add(emailCanonical);
          readyToImport.push({ ...user, email: String(user.email || '').trim() });
        }

        if (readyToImport.length === 0) {
          showAlert(
            'warning',
            'No new users to import (all emails already exist or are duplicates).',
            duplicates.slice(0, 10).map((item) => `${item.email}: ${item.reason}`)
          );
          event.target.value = '';
          return;
        }

        // Add imported users
        Promise.allSettled(readyToImport.map((user) => addUser(user)))
          .then((results) => {
            const successCount = results.filter((item) => item.status === 'fulfilled').length;
            const failedCount = results.length - successCount;
            const skippedCount = duplicates.length;
            if (failedCount > 0 || skippedCount > 0) {
              showAlert(
                'warning',
                `Imported ${successCount} user(s). Failed: ${failedCount}. Skipped: ${skippedCount}.`,
                skippedCount
                  ? duplicates.slice(0, 10).map((item) => `${item.email}: ${item.reason}`)
                  : []
              );
            } else {
              showAlert('success', `Successfully imported ${successCount} user(s) from Excel!`);
            }
          });
        event.target.value = '';
      } catch (error) {
        console.error('Error parsing Excel file:', error);
        showAlert('error', 'Error reading Excel file. Please ensure it is a valid Excel file with the required columns.');
        event.target.value = '';
      }
    };

    reader.onerror = () => {
      showAlert('error', 'Error reading file. Please try again.');
      event.target.value = '';
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="users-page fade-in">
      <div className="page-header">
        <div className="page-title">
          <h2>Portal users</h2>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="search-bar">
          <Search width={20} height={20} strokeWidth={2} />
          <input
            type="text"
            placeholder="Search users..."
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
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download width={18} height={18} strokeWidth={2} />
            Export
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            <Plus width={18} height={18} strokeWidth={2} />
            Create Portal Users
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xls,.xlsx"
        style={{ display: 'none' }}
        onChange={handleImportChange}
      />

      {showFilters && (
        <div className="advanced-filters fade-in">
          <div className="filter-grid">
            <div className="input-group">
              <label>Name</label>
              <input
                type="text"
                placeholder="Filter by name"
                value={filters.name}
                onChange={(e) => setFilters({ ...filters, name: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Role</label>
              <select
                value={filters.role}
                onChange={(e) => setFilters({ ...filters, role: e.target.value })}
              >
                <option value="">All Roles</option>
                {availableRoleOptions.map((roleName) => (
                  <option key={roleName} value={roleName}>{roleName}</option>
                ))}
              </select>
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
                Name {nameSortDirection === 'asc' ? '↑' : '↓'}
              </th>
              <th>Email</th>
              <th>Role</th>
              <th>Created Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => (
              <tr key={user.id}>
                <td><strong>{user.name}</strong></td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{user.createdDate}</td>
                <td>
                  <span className={`status-badge status-${user.status.toLowerCase()}`}>
                    {user.status}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="action-btn edit-btn"
                      onClick={() => handleEdit(user)}
                      title="Edit"
                    >
                      <EditPencil width={18} height={18} strokeWidth={2} />
                    </button>
                    {/* Temporarily hidden for this week (requested): reset password key action */}
                    {/*
                    <button
                      className="action-btn reset-btn"
                      onClick={() => handleOpenResetModal(user)}
                      title="Reset Password"
                    >
                      <Key width={18} height={18} strokeWidth={2} />
                    </button>
                    */}
                    <button
                      className="action-btn delete-btn"
                      onClick={() => requestDelete(user.id)}
                      title="Delete"
                    >
                      <Trash width={18} height={18} strokeWidth={2} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sortedUsers.length === 0 && (
          <div className="empty-state">
            <p>No users found</p>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="modal-overlay users-create-modal-overlay">
          <div className="modal users-create-modal">
            <div className="modal-header">
              <h2>Create Portal User</h2>
              <button
                className="modal-close"
                onClick={() => {
                  setShowAddModal(false);
                  // Reset form state
                  setNewUser({
                    name: '',
                    email: '',
                    password: '',
                    confirmPassword: '',
                    expiryDate: '',
                    role: availableRoleOptions[0],
                    status: 'Active'
                  });
                }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAdd} autoComplete="off">
              <div className="users-section-card">
                <h3>User Details</h3>
                <div className="input-group">
                  <label>Name *</label>
                  <input
                    type="text"
                    required
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: sanitizeAlpha(e.target.value) })}
                    autoComplete="off"
                  />
                </div>
                <div className="input-group">
                  <label>Email *</label>
                  <input
                    type="email"
                    required
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    autoComplete="off"
                  />
                </div>
                <div className="users-password-row">
                  <div className="input-group">
                    <label>Password *</label>
                    <input
                      type="password"
                      required
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="input-group">
                    <label>Retype Password *</label>
                    <input
                      type="password"
                      required
                      value={newUser.confirmPassword}
                      onChange={(e) => setNewUser({ ...newUser, confirmPassword: e.target.value })}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </div>
              <div className="users-section-card">
                <h3>Access Details</h3>
                <div className="input-group">
                  <label>Role *</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  >
                    {availableRoleOptions.map((roleName) => (
                      <option key={roleName} value={roleName}>{roleName}</option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label>Status *</label>
                  <select
                    value={newUser.status}
                    onChange={(e) => setNewUser({ ...newUser, status: e.target.value })}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowAddModal(false);
                    // Reset form state
                    setNewUser({
                      name: '',
                      email: '',
                      password: '',
                    confirmPassword: '',
                    expiryDate: '',
                    role: availableRoleOptions[0],
                    status: 'Active'
                  });
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUserId && editedUser && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Edit User</h2>
              <button
                className="modal-close"
                onClick={handleCancelEdit}
              >
                &times;
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await handleSave();
              }}
            >
              <div className="input-group">
                <label>Name *</label>
                <input
                  type="text"
                  required
                  value={editedUser.name || ''}
                  onChange={(e) => setEditedUser({ ...editedUser, name: sanitizeAlpha(e.target.value) })}
                />
              </div>
              <div className="input-group">
                <label>Email *</label>
                <input
                  type="email"
                  required
                  value={editedUser.email || ''}
                  onChange={(e) => setEditedUser({ ...editedUser, email: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label>Role *</label>
                <select
                  value={editedUser.role || availableRoleOptions[0]}
                  onChange={(e) => setEditedUser({ ...editedUser, role: e.target.value })}
                >
                  {availableRoleOptions.map((roleName) => (
                    <option key={roleName} value={roleName}>{roleName}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>Status *</label>
                <select
                  value={editedUser.status || 'Active'}
                  onChange={(e) => setEditedUser({ ...editedUser, status: e.target.value })}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCancelEdit}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && resetTargetUser && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Reset Password</h2>
              <button
                className="modal-close"
                onClick={handleCloseResetModal}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleResetPasswordSubmit} autoComplete="off">
              <div className="input-group">
                <label>User Email</label>
                <input type="email" value={resetTargetUser.email} disabled />
              </div>
              <div className="users-password-row">
                <div className="input-group">
                  <label>New Password *</label>
                  <input
                    type="password"
                    required
                    value={resetPasswordForm.password}
                    onChange={(e) => setResetPasswordForm({ ...resetPasswordForm, password: e.target.value })}
                    autoComplete="new-password"
                  />
                </div>
                <div className="input-group">
                  <label>Retype Password *</label>
                  <input
                    type="password"
                    required
                    value={resetPasswordForm.confirmPassword}
                    onChange={(e) => setResetPasswordForm({ ...resetPasswordForm, confirmPassword: e.target.value })}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="input-group">
                <p style={{ color: '#666', fontSize: '14px', margin: '15px 0' }}>
                  The password will be updated immediately and a confirmation email will be sent to <strong>{resetTargetUser.email}</strong>.
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseResetModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={resetSubmitting}>
                  {resetSubmitting ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {alertModal.show && (
        <div className="modal-overlay">
          <div className={`modal alert-modal alert-modal-${alertModal.type}`}>
            <div className="modal-header">
              <div className="modal-header-content">
                <h2>{alertModal.title}</h2>
                <p className={`alert-modal-subtitle ${alertModal.type}`}>
                  {alertModal.type === 'success' && 'Success'}
                  {alertModal.type === 'error' && 'Error'}
                  {alertModal.type === 'warning' && 'Warning'}
                  {alertModal.type === 'info' && 'Information'}
                </p>
              </div>
              <button
                className="modal-close"
                onClick={closeAlert}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className={`alert-modal-icon ${alertModal.type}`}>
                {alertModal.type === 'success' && '✓'}
                {alertModal.type === 'error' && '✕'}
                {alertModal.type === 'warning' && '⚠'}
                {alertModal.type === 'info' && 'i'}
              </div>
              <p className="alert-modal-message">{alertModal.message}</p>
              {alertModal.details && alertModal.details.length > 0 && (
                <div className="alert-modal-details">
                  {alertModal.details.map((detail, index) => (
                    <p key={index} className="alert-modal-detail-item">{detail}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className={`btn btn-${alertModal.type === 'success' ? 'primary' : alertModal.type === 'error' ? 'danger' : 'secondary'}`}
                onClick={closeAlert}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal.show && (
        <div className="modal-overlay" onClick={closeConfirmModal}>
          <div className="modal users-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-content">
                <h2>{confirmModal.title}</h2>
              </div>
              <button className="modal-close" onClick={closeConfirmModal}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="users-confirm-modal-icon">!</div>
              <p className="users-confirm-modal-message">{confirmModal.message}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeConfirmModal}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleConfirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
