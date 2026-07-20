const API_BASE_URL =process.env.REACT_APP_WEB_BACKEND_URL;
const API_TIMEOUT_MS = Number(process.env.REACT_APP_API_TIMEOUT_MS || 12000);

const request = async (path, options = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options,
      signal: options.signal || controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Server is taking too long to respond. Please check the API and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      const detail = payload?.detail;
      if (Array.isArray(detail)) {
        const formatted = detail
          .map((item) => item?.msg || JSON.stringify(item))
          .filter(Boolean)
          .join(', ');
        throw new Error(formatted || `Request failed with status ${response.status}`);
      }
      throw new Error(detail || payload?.message || `Request failed with status ${response.status}`);
    }
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

export const getOrganizations = () => request('/organizations');

export const getOrganizationById = (id) => request(`/organizations/${id}`);

export const createOrganization = (payload) =>
  request('/organizations', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateOrganization = (id, payload) =>
  request(`/organizations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const deleteOrganization = (id) =>
  request(`/organizations/${id}`, {
    method: 'DELETE'
  });

export const createOrgAdminUser = (orgId, payload) =>
  request(`/organizations/${orgId}/admin-users`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateOrgAdminUser = (orgId, adminId, payload) =>
  request(`/organizations/${orgId}/admin-users/${adminId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const deleteOrgAdminUser = (orgId, adminId) =>
  request(`/organizations/${orgId}/admin-users/${adminId}`, {
    method: 'DELETE'
  });

export const resetOrgAdminPassword = (orgId, adminId, payload) =>
  request(`/organizations/${orgId}/admin-users/${adminId}/reset-password`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getUsers = () => request('/users');
export const getRoles = () => request('/roles');

export const createUser = (payload) =>
  request('/users', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateUser = (id, payload) =>
  request(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const deleteUser = (id) =>
  request(`/users/${id}`, {
    method: 'DELETE'
  });

export const sendPasswordResetEmail = (id, payload) =>
  request(`/users/${id}/send-reset-email`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateRole = (roleKey, payload) =>
  request(`/roles/${roleKey}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const login = (email, password) =>
  request('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

export const checkEmailAvailability = (orgId, email) =>
  request(`/check-email/${orgId}/${encodeURIComponent(email)}`);
