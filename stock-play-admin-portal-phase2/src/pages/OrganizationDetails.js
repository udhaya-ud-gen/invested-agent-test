import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  checkEmailAvailability,
  createOrgAdminUser,
  updateOrgAdminUser,
  deleteOrgAdminUser,
  resetOrgAdminPassword
} from '../utils/api';
import { sanitizeAlpha, sanitizeDigits } from '../utils/inputSanitizers';
import { STATE_OPTIONS, COUNTRY_OPTIONS } from '../utils/locationOptions';
import {
  ArrowLeft,
  FloppyDisk,
  XmarkCircle,
  Search,
  Filter,
  Download,
  Plus,
  EditPencil,
  Trash,
  Group,
  Eye,
  Key
} from 'iconoir-react';
import './OrganizationDetails.css';

const DEFAULT_LEVEL_CONFIG = [
  { level: 'Beginner', startingBalance: 50000, gainTarget: 200000 },
  { level: 'Intermediate', startingBalance: 200000, gainTarget: 500000 }
];

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const OrganizationDetails = ({ orgIdOverride } = {}) => {
  const { id: routeId } = useParams();
  const id = orgIdOverride || routeId;
  const isMyOrgMode = Boolean(orgIdOverride);
  const navigate = useNavigate();
  const { organizations, updateOrganization, refreshOrganizations } = useApp();
  const organization = organizations.find(org => org.id === id);
  useEffect(() => {
    refreshOrganizations().catch((error) => {
      console.error('Failed to refresh organizations on organization details', error);
    });
  }, [refreshOrganizations]);


  const buildAddress = (address = {}) => ({
    streetLine1: '',
    streetLine2: '',
    city: '',
    state: '',
    country: '',
    pincode: '',
    ...address
  });

  const buildContact = (contact = {}) => ({
    primary: {
      phone: '',
      email: '',
      ...(contact.primary || {})
    },
    secondary: {
      phone: '',
      email: '',
      ...(contact.secondary || {})
    }
  });

  const normalizeOrg = (org) => {
    if (!org) return {};
    return {
      ...org,
      address: buildAddress(org.address),
      contact: buildContact(org.contact)
    };
  };

  const getOrgLicensePrefix = (name = '', orgId = '') => {
    const words = String(name)
      .trim()
      .split(/\s+/)
      .map((word) => word.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())
      .filter(Boolean);

    let basePrefix = 'ORG';
    if (words.length > 0) {
      const firstWord = words[0];
      if (firstWord.length === 4) {
        basePrefix = firstWord.slice(0, 4);
      } else if (firstWord.length > 4) {
        basePrefix = firstWord.slice(0, 3);
      } else if (firstWord.length >= 3) {
        basePrefix = firstWord.slice(0, 3);
      } else {
        const tailInitials = words.slice(1).map((word) => word[0]).join('');
        const candidate = `${firstWord}${tailInitials}`;
        basePrefix = (candidate.slice(0, 3) || 'ORG').padEnd(2, 'X');
      }
    }

    const cleanedOrgId = String(orgId || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const orgToken = (cleanedOrgId.slice(-3) || 'XXX').padStart(3, 'X');
    return `${basePrefix}${orgToken}`;
  };

  const formatLicenseCode = (prefix, number) => `${prefix}${String(number).padStart(2, '0')}`;

  const getNextLicenseCodeNumber = (licenses, prefix) => {
    const regex = new RegExp(`^${prefix}(\\d+)$`);
    const parsedMax = (licenses || []).reduce((max, license) => {
      const code = String(license.licenseCode || '');
      const match = code.match(regex);
      if (!match) return max;
      const numericPart = Number(match[1]);
      return Number.isFinite(numericPart) ? Math.max(max, numericPart) : max;
    }, 0);

    return parsedMax + 1;
  };

  const [activeTab, setActiveTab] = useState('details');
  const [isEditing, setIsEditing] = useState(false);
  const [editedOrg, setEditedOrg] = useState(normalizeOrg(organization));
  const [isEditingLevels, setIsEditingLevels] = useState(false);
  const [editedLevels, setEditedLevels] = useState([]);
  const [licenseSearchTerm, setLicenseSearchTerm] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [licenseModalSearchTerm, setLicenseModalSearchTerm] = useState('');
  const [showLicenseFilters, setShowLicenseFilters] = useState(false);
  const [showUserFilters, setShowUserFilters] = useState(false);
  const [showLicenseModalFilters, setShowLicenseModalFilters] = useState(false);
  const [authorizedUserSortDirection, setAuthorizedUserSortDirection] = useState('asc');
  const [licenseModalUserSortDirection, setLicenseModalUserSortDirection] = useState('asc');
  const [licenseFilters, setLicenseFilters] = useState({
    status: '',
    dateFrom: '',
    dateTo: ''
  });
  const [userFilters, setUserFilters] = useState({
    status: '',
    dateFrom: '',
    dateTo: ''
  });
  const [licenseModalFilters, setLicenseModalFilters] = useState({
    status: '',
    dateFrom: '',
    dateTo: ''
  });
  const [editingLicenseId, setEditingLicenseId] = useState(null);
  const [editedLicense, setEditedLicense] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editedUser, setEditedUser] = useState(null);  const [showCreateLicense, setShowCreateLicense] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [selectedLicenseForUsers, setSelectedLicenseForUsers] = useState(null);
  const suppressRegistrationAlertRef = React.useRef(false);
  const [showLicenseAssignForm, setShowLicenseAssignForm] = useState(false);
  const [licenseAssign, setLicenseAssign] = useState({ email: '', name: '' });
  const [licenseAssignExpiryDate, setLicenseAssignExpiryDate] = useState('');
  const [licenseAssignState, setLicenseAssignState] = useState({ mode: 'idle', message: '', user: null });
  const [newLicense, setNewLicense] = useState({
    expiryDate: '',
    count: '0',
    status: 'Active'
  });
  const [newAuthorizedUser, setNewAuthorizedUser] = useState({
    name: '',
    email: '',
    expiryDate: ''
  });  const [emailValidation, setEmailValidation] = useState({ message: '', type: '' }); // For email validation
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);  const [alertModal, setAlertModal] = useState({ show: false, type: '', title: '', message: '', details: [] });
  const [confirmModal, setConfirmModal] = useState({ show: false, type: '', title: '', message: '', targetId: null });

  const [showAddOrgAdminModal, setShowAddOrgAdminModal] = useState(false);
  const [newOrgAdminUser, setNewOrgAdminUser] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    status: 'Active'
  });
  const [editingOrgAdminId, setEditingOrgAdminId] = useState(null);
  const [editedOrgAdminUser, setEditedOrgAdminUser] = useState(null);
  const [showOrgAdminResetModal, setShowOrgAdminResetModal] = useState(false);
  const [orgAdminResetTarget, setOrgAdminResetTarget] = useState(null);
  const [orgAdminResetForm, setOrgAdminResetForm] = useState({ password: '', confirmPassword: '' });
  const [orgAdminResetSubmitting, setOrgAdminResetSubmitting] = useState(false);

  const showAlert = (type, title, message, details = []) => {
    setAlertModal({ show: true, type, title, message, details });
  };

  const closeAlert = () => {
    setAlertModal({ show: false, type: '', title: '', message: '', details: [] });
  };

  const openConfirmModal = (type, title, message, targetId) => {
    setConfirmModal({ show: true, type, title, message, targetId });
  };

  const closeConfirmModal = () => {
    setConfirmModal({ show: false, type: '', title: '', message: '', targetId: null });
  };

  if (!organization) {
    return (
      <div className="organization-details-page">
        <div className="error-state">
          <h2>Organization not found</h2>
          <button className="btn btn-primary" onClick={() => navigate('/organizations')}>
                Go Back
          </button>
        </div>
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

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

  const formatExpiryForUi = (dateValue) => {
    if (!dateValue) return '-';
    const raw = String(dateValue).trim();
    return toCanonicalDate(raw) || raw;
  };

  const sameCalendarDate = (left, right) => {
    const l = toCanonicalDate(left);
    const r = toCanonicalDate(right);
    return Boolean(l && r && l === r);
  };

  const isDateExpired = (dateValue) => {
    const canonical = toCanonicalDate(dateValue);
    if (!canonical) return false;
    const date = new Date(canonical);
    if (Number.isNaN(date.getTime())) return false;
    date.setHours(0, 0, 0, 0);
    return date < today;
  };

  const licensesWithEffectiveStatus = (organization.licenseHistory || []).map((license) => ({
    ...license,
    status: isDateExpired(license.expiryDate) ? 'Expired' : license.status
  }));
  const singleLicense = licensesWithEffectiveStatus.length === 1 ? licensesWithEffectiveStatus[0] : null;
  const isActiveLicenseStatus = (status) => String(status || '').trim().toLowerCase() === 'active';
  const selectedLicenseExpiryDate = toCanonicalDate(selectedLicenseForUsers?.expiryDate) || '';

  const normalizeAssignmentStatus = (statusValue) => {
    const normalized = String(statusValue || '').trim();
    return normalized || 'Invited';
  };

  const normalizeLicenseCodeValue = (codeValue) =>
    String(codeValue || '').trim().toUpperCase();

  const getUniqueLicenseByExpiryDate = (expiryValue, licenses = licensesWithEffectiveStatus) => {
    const matches = (licenses || []).filter((license) =>
      sameCalendarDate(license.expiryDate, expiryValue)
    );
    return matches.length === 1 ? matches[0] : null;
  };

  const buildAssignmentKey = (assignment) =>
    [
      String(assignment?.licenseId || '').trim(),
      toCanonicalDate(assignment?.expiryDate),
      String(assignment?.licenseCode || '').trim()
    ].join('::');

  const getUserLicenseAssignments = (user, licenses = licensesWithEffectiveStatus) => {
    const currentLicense = user?.licenseId
      ? licenses.find((license) => license.id === user.licenseId)
      : null;

    const legacyAssignments =
      user?.licenseId || user?.expiryDate || user?.licenseCode
        ? [
            {
              licenseId: user.licenseId || currentLicense?.id || null,
              licenseCode: user.licenseCode || currentLicense?.licenseCode || null,
              expiryDate: toCanonicalDate(user.expiryDate) || currentLicense?.expiryDate || '',
              status: normalizeAssignmentStatus(user.status)
            }
          ]
        : [];

    const normalizedAssignments = [];
    const seen = new Set();

    [...(Array.isArray(user?.licenseAssignments) ? user.licenseAssignments : []), ...legacyAssignments].forEach(
      (assignment) => {
        const normalizedAssignment = {
          ...assignment,
          licenseId: assignment?.licenseId || null,
          licenseCode: assignment?.licenseCode || null,
          expiryDate: toCanonicalDate(assignment?.expiryDate) || '',
          status: normalizeAssignmentStatus(assignment?.status)
        };

        if (
          !normalizedAssignment.licenseId &&
          !normalizedAssignment.expiryDate &&
          !normalizedAssignment.licenseCode
        ) {
          return;
        }

        const assignmentKey = buildAssignmentKey(normalizedAssignment);
        if (seen.has(assignmentKey)) return;
        seen.add(assignmentKey);
        normalizedAssignments.push(normalizedAssignment);
      }
    );

    return normalizedAssignments;
  };

  const upsertLicenseAssignment = (assignments, assignment) => {
    const normalizedAssignment = {
      ...assignment,
      licenseId: assignment?.licenseId || null,
      licenseCode: assignment?.licenseCode || null,
      expiryDate: toCanonicalDate(assignment?.expiryDate) || '',
      status: normalizeAssignmentStatus(assignment?.status)
    };

    const normalizedLicenseCode = normalizeLicenseCodeValue(normalizedAssignment.licenseCode);

    const filteredAssignments = (assignments || []).filter((existingAssignment) => {
      if (normalizedAssignment.licenseId && existingAssignment?.licenseId) {
        return existingAssignment.licenseId !== normalizedAssignment.licenseId;
      }
      const existingCode = normalizeLicenseCodeValue(existingAssignment?.licenseCode);
      if (normalizedLicenseCode && existingCode) {
        return normalizedLicenseCode !== existingCode;
      }
      return !sameCalendarDate(existingAssignment?.expiryDate, normalizedAssignment.expiryDate);
    });

    return [...filteredAssignments, normalizedAssignment];
  };

  const getLicenseAssignmentForUser = (user, license, licenses = licensesWithEffectiveStatus) => {
    if (!license) return null;

    const assignments = getUserLicenseAssignments(user, licenses);
    const licenseCode = normalizeLicenseCodeValue(license.licenseCode);
    const matchedById = license.id
      ? assignments.find((assignment) => assignment.licenseId === license.id)
      : null;
    if (matchedById) return matchedById;

    if (licenseCode) {
      const matchedByCode = assignments.find(
        (assignment) => normalizeLicenseCodeValue(assignment.licenseCode) === licenseCode
      );
      if (matchedByCode) return matchedByCode;
    }

    const uniqueByExpiry = getUniqueLicenseByExpiryDate(license.expiryDate, licenses);
    if (uniqueByExpiry && uniqueByExpiry.id === license.id) {
      return (
        assignments.find(
          (assignment) =>
            !assignment.licenseId &&
            !assignment.licenseCode &&
            sameCalendarDate(assignment.expiryDate, license.expiryDate)
        ) || null
      );
    }

    return null;
  };

  const getAssignmentStatusForLicense = (assignment, license) => {
    const normalizedStatus = String(assignment?.status || '').trim();
    if (normalizedStatus.toLowerCase() === 'expired') return 'Expired';
    if (isDateExpired(assignment?.expiryDate)) return 'Expired';
    if (String(license?.status || '').toLowerCase() === 'expired') return 'Expired';
    return normalizedStatus || 'Invited';
  };

  const getMappedLicenseForUser = (user, licenses = licensesWithEffectiveStatus) => {
    const pickFallbackLicense = () => {
      if (!licenses.length) return null;

      const userCreated = toCanonicalDate(user.createdDate);
      if (!userCreated) return licenses[0];

      let fallback = null;
      let fallbackDate = '';
      licenses.forEach((license) => {
        const purchaseDate = toCanonicalDate(license.purchaseDate);
        if (!purchaseDate) {
          if (!fallback) fallback = license;
          return;
        }
        if (purchaseDate <= userCreated) {
          if (!fallback || purchaseDate > fallbackDate) {
            fallback = license;
            fallbackDate = purchaseDate;
          }
        }
      });

      return fallback || licenses[0];
    };

    const matchedById = user.licenseId
      ? licenses.find((license) => license.id === user.licenseId)
      : null;
    if (matchedById) return matchedById;

    const assignments = getUserLicenseAssignments(user, licenses);
    const assignmentWithId = assignments.find((assignment) => assignment.licenseId);
    if (assignmentWithId) {
      const matchedAssignmentLicense = licenses.find(
        (license) => license.id === assignmentWithId.licenseId
      );
      if (matchedAssignmentLicense) return matchedAssignmentLicense;
    }

    const normalizedUserLicenseCode = normalizeLicenseCodeValue(user.licenseCode);
    if (normalizedUserLicenseCode) {
      const matchedByCode = licenses.find(
        (license) => normalizeLicenseCodeValue(license.licenseCode) === normalizedUserLicenseCode
      );
      if (matchedByCode) return matchedByCode;
    }

    const assignmentWithCode = assignments.find((assignment) => assignment.licenseCode);
    if (assignmentWithCode) {
      const matchedAssignmentByCode = licenses.find(
        (license) =>
          normalizeLicenseCodeValue(license.licenseCode) ===
          normalizeLicenseCodeValue(assignmentWithCode.licenseCode)
      );
      if (matchedAssignmentByCode) return matchedAssignmentByCode;
    }

    const uniqueByExpiry = getUniqueLicenseByExpiryDate(user.expiryDate, licenses);
    if (uniqueByExpiry) return uniqueByExpiry;

    return pickFallbackLicense();
  };

  const expiredLicenseIds = new Set(
    licensesWithEffectiveStatus
      .filter((license) => String(license.status || '').toLowerCase() === 'expired')
      .map((license) => license.id)
  );
  const expiredLicenseExpiryDates = new Set(
    licensesWithEffectiveStatus
      .filter((license) => String(license.status || '').toLowerCase() === 'expired')
      .map((license) => license.expiryDate)
      .filter(Boolean)
  );

  const findLicenseForAssignment = (assignment) => {
    if (!assignment) return null;
    if (assignment.licenseId) {
      const byId = licensesWithEffectiveStatus.find((license) => license.id === assignment.licenseId);
      if (byId) return byId;
    }
    if (assignment.licenseCode) {
      const byCode = licensesWithEffectiveStatus.find(
        (license) => normalizeLicenseCodeValue(license.licenseCode) === normalizeLicenseCodeValue(assignment.licenseCode)
      );
      if (byCode) return byCode;
    }
    return null;
  };

  // An assignment's stored status string can go stale (e.g. still "Invited" even
  // after its license has since expired). Always derive the true status from the
  // license it's actually on, the same way the per-license view does.
  const getEffectiveAssignmentStatus = (assignment) =>
    getAssignmentStatusForLicense(assignment, findLicenseForAssignment(assignment));

  const authorizedUsersWithEffectiveStatus = (organization.authorizedUsers || []).map((user) => {
    const mappedLicense = getMappedLicenseForUser(user);
    const isMappedToExpiredLicense = Boolean(
      mappedLicense &&
      (expiredLicenseIds.has(mappedLicense.id) ||
        Array.from(expiredLicenseExpiryDates).some((licenseExpiryDate) =>
          sameCalendarDate(mappedLicense.expiryDate, licenseExpiryDate)
        ) ||
        (singleLicense && String(singleLicense.status || '').toLowerCase() === 'expired'))
    );

    // The top-level fields (licenseId/licenseCode/status) are the authoritative,
    // kept-in-sync record for as long as they point at a currently valid license —
    // trust them directly rather than a nested licenseAssignments entry, which can
    // go stale (e.g. a manual DB edit only touching the top-level status).
    if (mappedLicense && !isMappedToExpiredLicense) {
      const isExpiredUser =
        isDateExpired(user.expiryDate) || String(user.status || '').toLowerCase() === 'expired';
      return {
        ...user,
        status: isExpiredUser ? 'Expired' : user.status
      };
    }

    // Top-level reference is stale or points at an expired license — the user may
    // have since moved to a newer license. Look for a fresher assignment that's
    // still active on a currently non-expired license before giving up and marking
    // them Expired.
    const activeAssignment = getUserLicenseAssignments(user)
      .filter((assignment) => String(assignment.status || '').toLowerCase() !== 'expired')
      .find((assignment) => {
        const assignmentLicense = findLicenseForAssignment(assignment);
        return (
          assignmentLicense &&
          String(assignmentLicense.status || '').toLowerCase() !== 'expired' &&
          !isDateExpired(assignmentLicense.expiryDate)
        );
      });

    if (activeAssignment) {
      return {
        ...user,
        status: activeAssignment.status || user.status,
        licenseId: activeAssignment.licenseId || user.licenseId,
        licenseCode: activeAssignment.licenseCode || user.licenseCode,
        expiryDate: activeAssignment.expiryDate || user.expiryDate
      };
    }

    const isExpiredUser =
      isMappedToExpiredLicense ||
      isDateExpired(user.expiryDate) ||
      String(user.status || '').toLowerCase() === 'expired';

    return {
      ...user,
      status: isExpiredUser ? 'Expired' : user.status
    };
  });

  // Summary values aligned with DB-backed organization data.
  const totalLicenseCount = licensesWithEffectiveStatus.reduce(
    (sum, license) => sum + (license.count || 0),
    0
  );
  
  const activeLicenses = licensesWithEffectiveStatus
    .filter((license) => isActiveLicenseStatus(license.status))
    .reduce((sum, license) => sum + (Number(license.count) || 0), 0);
  const hasActiveLicense = activeLicenses > 0;

  const activeLicenseIds = new Set(
    licensesWithEffectiveStatus
      .filter((license) => isActiveLicenseStatus(license.status))
      .map((license) => license.id)
  );
  const activeLicenseAssignedUsers = authorizedUsersWithEffectiveStatus.filter((user) => {
    const mappedLicense = getMappedLicenseForUser(user);
    return Boolean(
      mappedLicense &&
      activeLicenseIds.has(mappedLicense.id) &&
      String(user.status || '').toLowerCase() !== 'expired'
    );
  }).length;

  const displayAuthorizedUsers = authorizedUsersWithEffectiveStatus.filter(
    (user) => user.status === 'Invited' || user.status === 'Registered'
  ).length;
  const currentLevels = organization.levelConfiguration?.length
    ? organization.levelConfiguration
    : DEFAULT_LEVEL_CONFIG;
  const invitedUsersCount = authorizedUsersWithEffectiveStatus.filter(
    (user) => user.status === 'Invited'
  ).length;
  const registeredUsersCount = authorizedUsersWithEffectiveStatus.filter(
    (user) => user.status === 'Registered'
  ).length;
  const expiredUsersCount = (organization.authorizedUsers || []).filter((user) => {
    if (String(user.status || '').toLowerCase() === 'expired') return true;
    return getUserLicenseAssignments(user).some(
      (assignment) => getEffectiveAssignmentStatus(assignment) === 'Expired'
    );
  }).length;
  
  // Validation: Authorized Users must never exceed Active Licenses
  const canAddMoreUsers = activeLicenses > 0 && activeLicenseAssignedUsers < activeLicenses;
  const remainingLicenseSlots = activeLicenses > 0 ? activeLicenses - activeLicenseAssignedUsers : 0;
  
  const earliestLicenseExpiryDate = (() => {
    const dates = licensesWithEffectiveStatus
      .filter((license) => {
        const canonicalExpiry = toCanonicalDate(license.expiryDate);
        return (
          Boolean(canonicalExpiry) &&
          String(license.status || '').toLowerCase() !== 'expired' &&
          !isDateExpired(canonicalExpiry)
        );
      })
      .map((license) => {
        const canonical = toCanonicalDate(license.expiryDate);
        const parsed = canonical ? new Date(canonical) : new Date(license.expiryDate);
        if (Number.isNaN(parsed.getTime())) return null;
        parsed.setHours(0, 0, 0, 0);
        return {
          date: parsed,
          display: canonical || toCanonicalDate(parsed) || ''
        };
      })
      .filter((item) => item && item.date >= today)
      .sort((a, b) => a.date - b.date);

    return dates.length ? dates[0].display : '-';
  })();

  const handleSave = async () => {
    await updateOrganization(id, editedOrg);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedOrg(normalizeOrg(organization));
    setIsEditing(false);
  };

  const handleLicenseEdit = (license) => {
    setEditingLicenseId(license.id);
    setEditedLicense({ ...license });
  };

  const handleLicenseSave = async () => {
    const previousLicense = (organization.licenseHistory || []).find(
      (license) => license.id === editingLicenseId
    );

    const updatedLicenses = (organization.licenseHistory || []).map((license) =>
      license.id === editingLicenseId ? { ...license, ...editedLicense } : license
    );

    // Preserve user-to-license mapping when license fields/status are edited.
    const updatedUsers = (organization.authorizedUsers || []).map((user) => {
      if (!previousLicense) return user;

      const userAssignments = getUserLicenseAssignments(user, organization.licenseHistory || []);
      const previousLicenseCode = String(previousLicense.licenseCode || '').trim().toUpperCase();
      const editedLicenseCode = String(
        editedLicense.licenseCode || previousLicense.licenseCode || user.licenseCode || ''
      )
        .trim()
        .toUpperCase();
      const linkedByLicenseId =
        Boolean(user.licenseId) && user.licenseId === previousLicense.id;
      const linkedByLicenseCode =
        previousLicenseCode &&
        String(user.licenseCode || '').trim().toUpperCase() === previousLicenseCode;
      const linkedByLegacyExpiry =
        !user.licenseId && sameCalendarDate(user.expiryDate, previousLicense.expiryDate);
      const linkedByAssignment = userAssignments.some((assignment) =>
        assignment.licenseId === previousLicense.id ||
        (previousLicenseCode &&
          String(assignment.licenseCode || '').trim().toUpperCase() === previousLicenseCode) ||
        sameCalendarDate(assignment.expiryDate, previousLicense.expiryDate)
      );

      if (!linkedByLicenseId && !linkedByLicenseCode && !linkedByLegacyExpiry && !linkedByAssignment) {
        return user;
      }

      const updatedAssignments = userAssignments.map((assignment) => {
        const matchesPreviousLicense =
          assignment.licenseId === previousLicense.id ||
          (previousLicenseCode &&
            String(assignment.licenseCode || '').trim().toUpperCase() === previousLicenseCode) ||
          sameCalendarDate(assignment.expiryDate, previousLicense.expiryDate);

        if (!matchesPreviousLicense) return assignment;

        return {
          ...assignment,
          licenseId: editingLicenseId,
          licenseCode: editedLicenseCode || assignment.licenseCode || null,
          expiryDate: toCanonicalDate(editedLicense.expiryDate) || assignment.expiryDate
        };
      });

      return {
        ...user,
        licenseId: editingLicenseId,
        licenseCode: editedLicenseCode || user.licenseCode || null,
        expiryDate: toCanonicalDate(editedLicense.expiryDate) || user.expiryDate,
        licenseAssignments: updatedAssignments
      };
    });

    await updateOrganization(id, {
      licenseHistory: updatedLicenses,
      authorizedUsers: updatedUsers
    });
    setEditingLicenseId(null);
    setEditedLicense(null);
  };

  const handleLicenseCancel = () => {
    setEditingLicenseId(null);
    setEditedLicense(null);
  };

  const handleLicenseDelete = async (licenseId) => {
    if (!licenseId) return;
    const updatedLicenses = (organization.licenseHistory || []).filter(
      (license) => license.id !== licenseId
    );
    await updateOrganization(id, { licenseHistory: updatedLicenses });
  };

  const requestLicenseDelete = (licenseId) => {
    openConfirmModal(
      'license-delete',
      'Delete License',
      'Are you sure you want to delete this license record?',
      licenseId
    );
  };

  const openLicenseUsersModal = (license) => {
    suppressRegistrationAlertRef.current = false;
    closeConfirmModal();
    setSelectedLicenseForUsers(license);
    setLicenseModalSearchTerm('');
    setShowLicenseModalFilters(false);
    setLicenseModalFilters({ status: '', dateFrom: '', dateTo: '' });
    setShowLicenseAssignForm(false);
    setEditingUserId(null);
    setEditedUser(null);
    setLicenseAssign({ email: '', name: '' });
    setLicenseAssignExpiryDate(toCanonicalDate(license?.expiryDate) || '');
    setLicenseAssignState({ mode: 'idle', message: '', user: null });
  };

  const closeLicenseUsersModal = () => {
    suppressRegistrationAlertRef.current = true;
    closeConfirmModal();
    setSelectedLicenseForUsers(null);
    setLicenseModalSearchTerm('');
    setShowLicenseModalFilters(false);
    setLicenseModalFilters({ status: '', dateFrom: '', dateTo: '' });
    setShowLicenseAssignForm(false);
    setEditingUserId(null);
    setEditedUser(null);
    setLicenseAssign({ email: '', name: '' });
    setLicenseAssignExpiryDate('');
    setLicenseAssignState({ mode: 'idle', message: '', user: null });
    closeAlert();
  };

  const resetLicenseAssignSection = () => {
    setShowLicenseAssignForm(false);
    setLicenseAssign({ email: '', name: '' });
    setLicenseAssignExpiryDate('');
    setLicenseAssignState({ mode: 'idle', message: '', user: null });
  };

  const resetAuthorizedInlineEditSection = () => {
    setEditingUserId(null);
    setEditedUser(null);
  };

  const handleAuthorizedEdit = (user) => {
    if (!isMyOrgMode && selectedLicenseForUsers && user.isHistoricalLicenseAssignment) {
      showAlert(
        'error',
        organization.name,
        'Historical expired assignments are read-only. Edit the current active assignment from the active license or users tab.'
      );
      return;
    }
    suppressRegistrationAlertRef.current = false;
    resetLicenseAssignSection();
    setEditingUserId(user.id);
    setEditedUser({ ...user, level: user.level || 'Beginner' });
  };

  const handleAuthorizedSave = async () => {
    const previousUser = (organization.authorizedUsers || []).find(
      (user) => user.id === editingUserId
    );
    const shouldSendRegistrationAlert = Boolean(
      previousUser && previousUser.status !== 'Registered' && editedUser.status === 'Registered'
    );
    const alertEmail = editedUser?.email;

    const updatedUsers = (organization.authorizedUsers || []).map((user) => {
      if (user.id !== editingUserId) return user;

      const nextUser = { ...user, ...editedUser };
      const activeLicense =
        (nextUser.licenseId
          ? licensesWithEffectiveStatus.find((license) => license.id === nextUser.licenseId)
          : null) || getMappedLicenseForUser(nextUser);

      const nextAssignments = activeLicense
        ? upsertLicenseAssignment(getUserLicenseAssignments(user), {
            licenseId: activeLicense.id,
            licenseCode: nextUser.licenseCode || activeLicense.licenseCode || null,
            expiryDate: nextUser.expiryDate || activeLicense.expiryDate,
            status: nextUser.status
          })
        : getUserLicenseAssignments(user);

      return {
        ...nextUser,
        licenseAssignments: nextAssignments
      };
    });
    await updateOrganization(id, { authorizedUsers: updatedUsers });
    setEditingUserId(null);
    setEditedUser(null);

    if (shouldSendRegistrationAlert && !suppressRegistrationAlertRef.current) {
      showAlert('success', organization.name, `Email sent to ${alertEmail}: Your account has been registered.`);
    }
    suppressRegistrationAlertRef.current = false;
  };

  const handleAuthorizedCancel = () => {
    setEditingUserId(null);
    setEditedUser(null);
  };

  const handleAuthorizedDelete = async (userId) => {
    if (!userId) {
      console.error('Cannot delete user: userId is undefined or null');
      showAlert('error', organization.name, 'Cannot delete user. Invalid user ID.');
      return;
    }

    
    const updatedUsers = (organization.authorizedUsers || []).filter(
      (user) => {
        return user.id !== userId;
      }
    );
    
    await updateOrganization(id, { authorizedUsers: updatedUsers });
  };

  const requestAuthorizedDelete = (userId) => {
    if (!userId) {
      showAlert('error', organization.name, 'Cannot delete user. Invalid user ID.');
      return;
    }

    openConfirmModal(
      'user-delete',
      'Delete User',
      'Are you sure you want to delete this user?',
      userId
    );
  };

  const handleConfirmAction = async () => {
    const { type, targetId } = confirmModal;
    closeConfirmModal();

    if (type === 'license-delete') {
      await handleLicenseDelete(targetId);
      return;
    }

    if (type === 'user-delete') {
      await handleAuthorizedDelete(targetId);
      return;
    }

    if (type === 'org-admin-delete') {
      await handleDeleteOrgAdmin(targetId);
    }
  };

  const orgAdminUsersForThisOrg = organization.orgAdminUsers || [];

  const handleAddOrgAdmin = async (e) => {
    e.preventDefault();
    if (newOrgAdminUser.password !== newOrgAdminUser.confirmPassword) {
      showAlert('error', organization.name, 'Passwords do not match.');
      return;
    }

    try {
      await createOrgAdminUser(organization.id, {
        name: newOrgAdminUser.name,
        email: String(newOrgAdminUser.email || '').trim(),
        password: newOrgAdminUser.password,
        status: newOrgAdminUser.status
      });
      await refreshOrganizations();
      setShowAddOrgAdminModal(false);
      setNewOrgAdminUser({ name: '', email: '', password: '', confirmPassword: '', status: 'Active' });
      showAlert('success', organization.name, 'Org admin user created successfully.');
    } catch (error) {
      showAlert('error', organization.name, `Unable to create org admin user. ${error.message || ''}`.trim());
    }
  };

  const handleEditOrgAdmin = (user) => {
    setEditingOrgAdminId(user.id);
    setEditedOrgAdminUser({ name: user.name, status: user.status });
  };

  const handleCancelEditOrgAdmin = () => {
    setEditingOrgAdminId(null);
    setEditedOrgAdminUser(null);
  };

  const handleSaveOrgAdmin = async (id) => {
    try {
      await updateOrgAdminUser(organization.id, id, {
        name: editedOrgAdminUser.name,
        status: editedOrgAdminUser.status
      });
      await refreshOrganizations();
      setEditingOrgAdminId(null);
      setEditedOrgAdminUser(null);
    } catch (error) {
      showAlert('error', organization.name, `Unable to update org admin user. ${error.message || ''}`.trim());
    }
  };

  const requestDeleteOrgAdmin = (id) => {
    openConfirmModal(
      'org-admin-delete',
      'Delete Org Admin User',
      'Are you sure you want to delete this org admin user?',
      id
    );
  };

  const handleDeleteOrgAdmin = async (id) => {
    try {
      await deleteOrgAdminUser(organization.id, id);
      await refreshOrganizations();
      showAlert('success', organization.name, 'Org admin user deleted successfully.');
    } catch (error) {
      showAlert('error', organization.name, `Unable to delete org admin user. ${error.message || ''}`.trim());
    }
  };

  const handleOpenOrgAdminReset = (user) => {
    setOrgAdminResetTarget(user);
    setOrgAdminResetForm({ password: '', confirmPassword: '' });
    setShowOrgAdminResetModal(true);
  };

  const handleCloseOrgAdminReset = () => {
    setShowOrgAdminResetModal(false);
    setOrgAdminResetTarget(null);
    setOrgAdminResetForm({ password: '', confirmPassword: '' });
    setOrgAdminResetSubmitting(false);
  };

  const handleOrgAdminResetSubmit = async (e) => {
    e.preventDefault();

    if (!orgAdminResetTarget?.id) {
      showAlert('error', organization.name, 'Unable to identify selected user.');
      return;
    }

    if (!orgAdminResetForm.password || !orgAdminResetForm.confirmPassword) {
      showAlert('error', organization.name, 'Please enter and confirm the new password.');
      return;
    }

    if (orgAdminResetForm.password !== orgAdminResetForm.confirmPassword) {
      showAlert('error', organization.name, 'Passwords do not match.');
      return;
    }

    try {
      setOrgAdminResetSubmitting(true);
      await resetOrgAdminPassword(organization.id, orgAdminResetTarget.id, {
        password: orgAdminResetForm.password,
        confirmPassword: orgAdminResetForm.confirmPassword
      });
      handleCloseOrgAdminReset();
      showAlert('success', organization.name, 'Password reset successfully.');
    } catch (error) {
      showAlert('error', organization.name, 'Password reset failed. Please try again.');
    } finally {
      setOrgAdminResetSubmitting(false);
    }
  };

  const renderOrgAdminUsersTab = () => (
    <div className="details-section fade-in">
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div className="page-header-left">
          <h3 style={{ margin: 0 }}>Org Admin Users</h3>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddOrgAdminModal(true)}>
          <Plus width={18} height={18} strokeWidth={2} />
          Create Admin Users
        </button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Created Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orgAdminUsersForThisOrg.map((user) => (
              <tr key={user.id}>
                {editingOrgAdminId === user.id ? (
                  <>
                    <td>
                      <input
                        className="inline-edit"
                        type="text"
                        value={editedOrgAdminUser.name}
                        onChange={(e) => setEditedOrgAdminUser({ ...editedOrgAdminUser, name: sanitizeAlpha(e.target.value) })}
                      />
                    </td>
                    <td>{user.email}</td>
                    <td>Org Admin</td>
                    <td>{user.createdDate}</td>
                    <td>
                      <select
                        className="inline-edit"
                        value={editedOrgAdminUser.status}
                        onChange={(e) => setEditedOrgAdminUser({ ...editedOrgAdminUser, status: e.target.value })}
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button className="action-btn save-btn" onClick={() => handleSaveOrgAdmin(user.id)} title="Save">
                          <FloppyDisk width={18} height={18} strokeWidth={2} />
                        </button>
                        <button className="action-btn cancel-btn" onClick={handleCancelEditOrgAdmin} title="Cancel">
                          <XmarkCircle width={18} height={18} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td><strong>{user.name}</strong></td>
                    <td>{user.email}</td>
                    <td>Org Admin</td>
                    <td>{user.createdDate}</td>
                    <td>
                      <span className={`status-badge status-${user.status.toLowerCase()}`}>
                        {user.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button className="action-btn edit-btn" onClick={() => handleEditOrgAdmin(user)} title="Edit">
                          <EditPencil width={18} height={18} strokeWidth={2} />
                        </button>
                        <button className="action-btn reset-btn" onClick={() => handleOpenOrgAdminReset(user)} title="Reset Password">
                          <Key width={18} height={18} strokeWidth={2} />
                        </button>
                        <button className="action-btn delete-btn" onClick={() => requestDeleteOrgAdmin(user.id)} title="Delete">
                          <Trash width={18} height={18} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {orgAdminUsersForThisOrg.length === 0 && (
          <div className="empty-state">
            <p>No org admin users found</p>
          </div>
        )}
      </div>

      {showAddOrgAdminModal && (
        <div className="modal-overlay users-create-modal-overlay">
          <div className="modal users-create-modal">
            <div className="modal-header">
              <h2>Create Organization Admin User</h2>
              <button
                className="modal-close"
                onClick={() => {
                  setShowAddOrgAdminModal(false);
                  setNewOrgAdminUser({ name: '', email: '', password: '', confirmPassword: '', status: 'Active' });
                }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAddOrgAdmin} autoComplete="off">
              <div className="users-section-card">
                <h3>User Details</h3>
                <div className="input-group">
                  <label>Name *</label>
                  <input
                    type="text"
                    required
                    value={newOrgAdminUser.name}
                    onChange={(e) => setNewOrgAdminUser({ ...newOrgAdminUser, name: sanitizeAlpha(e.target.value) })}
                    autoComplete="off"
                  />
                </div>
                <div className="input-group">
                  <label>Email *</label>
                  <input
                    type="email"
                    required
                    value={newOrgAdminUser.email}
                    onChange={(e) => setNewOrgAdminUser({ ...newOrgAdminUser, email: e.target.value })}
                    autoComplete="off"
                  />
                </div>
                <div className="users-password-row">
                  <div className="input-group">
                    <label>Password *</label>
                    <input
                      type="password"
                      required
                      value={newOrgAdminUser.password}
                      onChange={(e) => setNewOrgAdminUser({ ...newOrgAdminUser, password: e.target.value })}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="input-group">
                    <label>Retype Password *</label>
                    <input
                      type="password"
                      required
                      value={newOrgAdminUser.confirmPassword}
                      onChange={(e) => setNewOrgAdminUser({ ...newOrgAdminUser, confirmPassword: e.target.value })}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </div>
              <div className="users-section-card">
                <h3>Access Details</h3>
                <div className="input-group">
                  <label>Role *</label>
                  <input type="text" value="Org Admin" disabled readOnly />
                </div>
                <div className="input-group">
                  <label>Status *</label>
                  <select
                    value={newOrgAdminUser.status}
                    onChange={(e) => setNewOrgAdminUser({ ...newOrgAdminUser, status: e.target.value })}
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
                    setShowAddOrgAdminModal(false);
                    setNewOrgAdminUser({ name: '', email: '', password: '', confirmPassword: '', status: 'Active' });
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

      {showOrgAdminResetModal && orgAdminResetTarget && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Reset Password</h2>
              <button className="modal-close" onClick={handleCloseOrgAdminReset}>
                &times;
              </button>
            </div>
            <form onSubmit={handleOrgAdminResetSubmit} autoComplete="off">
              <div className="input-group">
                <label>User Email</label>
                <input type="email" value={orgAdminResetTarget.email} disabled />
              </div>
              <div className="users-password-row">
                <div className="input-group">
                  <label>New Password *</label>
                  <input
                    type="password"
                    required
                    value={orgAdminResetForm.password}
                    onChange={(e) => setOrgAdminResetForm({ ...orgAdminResetForm, password: e.target.value })}
                    autoComplete="new-password"
                  />
                </div>
                <div className="input-group">
                  <label>Retype Password *</label>
                  <input
                    type="password"
                    required
                    value={orgAdminResetForm.confirmPassword}
                    onChange={(e) => setOrgAdminResetForm({ ...orgAdminResetForm, confirmPassword: e.target.value })}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="input-group">
                <p style={{ color: '#666', fontSize: '14px', margin: '15px 0' }}>
                  The password will be updated immediately and a confirmation email will be sent to <strong>{orgAdminResetTarget.email}</strong>.
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseOrgAdminReset}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={orgAdminResetSubmitting}>
                  {orgAdminResetSubmitting ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  const renderConfirmModal = () => (
    confirmModal.show && (
      <div className="modal-overlay" onClick={closeConfirmModal}>
        <div className="modal confirm-modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-header-content">
              <h2>{confirmModal.title}</h2>
            </div>
            <button
              className="modal-close"
              onClick={closeConfirmModal}
            >
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="confirm-modal-icon">!</div>
            <p className="confirm-modal-message">{confirmModal.message}</p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={closeConfirmModal}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleConfirmAction}>
              Delete
            </button>
          </div>
        </div>
      </div>
    )
  );

  const handleCreateLicense = async (event) => {
    event.preventDefault();
    
    // Set purchase date automatically to today's date
    const purchaseDate = new Date().toISOString().split('T')[0];
    
    const licensePrefix = getOrgLicensePrefix(organization.name, organization.id);
    const nextCodeNumber = getNextLicenseCodeNumber(organization.licenseHistory || [], licensePrefix);
    
    const licenseRecord = {
      id: `lic-${Date.now()}`,
      licenseCode: formatLicenseCode(licensePrefix, nextCodeNumber),
      type: 'Custom',
      purchaseDate: purchaseDate,
      expiryDate: newLicense.expiryDate,
      count: parseInt(newLicense.count, 10) || 0,
      status: newLicense.status
    };
    await updateOrganization(id, {
      licenseHistory: [...(organization.licenseHistory || []), licenseRecord]
    });
    setShowCreateLicense(false);
    setNewLicense({
      expiryDate: '',
      count: '0',
      status: 'Active'
    });
  };

  const normalizeLicenseCountInput = (rawValue) => {
    const digitsOnly = String(rawValue || '').replace(/\D/g, '');
    if (!digitsOnly) return '';
    return digitsOnly.replace(/^0+(?=\d)/, '');
  };

  const handleCreateAuthorizedUser = async (event) => {
    event.preventDefault();
    
    // === STRICT LICENSE VALIDATION ===
    // Check if adding user would exceed Active License limit
    const currentUserCount = activeLicenseAssignedUsers;
    const activeLicenseLimit = activeLicenses || 0;
    
    if (currentUserCount >= activeLicenseLimit) {
      showAlert('error', organization.name, `Cannot add user. Active License limit (${activeLicenseLimit}) reached.`, [
        `Total Licenses: ${totalLicenseCount}`,
        `Active Licenses: ${activeLicenseLimit}`,
        `Current Authorized Users: ${currentUserCount}`,
        `Available Slots: 0`,
        '',
        'Please increase Active Licenses or remove existing users before adding new ones.'
      ]);
      return;
    }
    
    // Validate email format
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(newAuthorizedUser.email)) {
      setEmailValidation({ message: 'Invalid email format', type: 'error' });
      return;
    }
    
    // Check if email already exists in this organization
    try {
      const result = await checkEmailAvailability(id, newAuthorizedUser.email);
      if (!result.available) {
        setEmailValidation({ message: 'This email already exists in this organization', type: 'error' });
        return;
      }
    } catch (error) {
      console.error('Error checking email:', error);
      // Continue with creation if API fails
    }
    
    // Set created date to today (system date)
    const createdDate = new Date().toISOString().split('T')[0];
    
    const mappedLicenseForNewUser = selectedLicenseForUsers || singleLicense || null;
    const userRecord = {
      id: `auth-${Date.now()}`,
      name: newAuthorizedUser.name,
      email: newAuthorizedUser.email,
      createdDate: createdDate,
      expiryDate: newAuthorizedUser.expiryDate,
      status: 'Invited',
      licenseId: mappedLicenseForNewUser?.id || null,
      licenseCode: mappedLicenseForNewUser?.licenseCode || null,
      licenseAssignments: mappedLicenseForNewUser
        ? [
            {
              licenseId: mappedLicenseForNewUser.id,
              licenseCode: mappedLicenseForNewUser.licenseCode || null,
              expiryDate: toCanonicalDate(newAuthorizedUser.expiryDate) || '',
              status: 'Invited'
            }
          ]
        : []
    };
    await updateOrganization(id, {
      authorizedUsers: [...(organization.authorizedUsers || []), userRecord]
    });
    setShowCreateUser(false);
    setNewAuthorizedUser({
      name: '',
      email: '',
      expiryDate: ''
    });
    setEmailValidation({ message: '', type: '' });
  };

  const handleEmailChange = async (email) => {
    setNewAuthorizedUser({ ...newAuthorizedUser, email });
    
    if (!email.trim()) {
      setEmailValidation({ message: '', type: '' });
      return;
    }
    
    // Validate email format
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      setEmailValidation({ message: 'Invalid email format', type: 'error' });
      return;
    }
    
    // Check email availability in backend
    setIsCheckingEmail(true);
    try {
      const result = await checkEmailAvailability(id, email);
      if (result.available) {
        setEmailValidation({ message: 'Email is available', type: 'success' });
      } else {
        setEmailValidation({ message: 'This email already exists in this organization', type: 'error' });
      }
    } catch (error) {
      console.error('Error checking email:', error);
      setEmailValidation({ message: 'Could not verify email', type: 'warning' });
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const getPortabilityStatus = (user = {}) => {
    const normalizedStatus = String(user.status || '').trim();
    if (!normalizedStatus || normalizedStatus.toLowerCase() === 'expired') {
      return 'Invited';
    }
    return normalizedStatus;
  };

  const findCrossOrgMatchByEmail = (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return null;

    for (const orgItem of organizations || []) {
      if (orgItem.id === organization.id) continue;
      const matchedUser = (orgItem.authorizedUsers || []).find(
        (user) => String(user.email || '').trim().toLowerCase() === normalizedEmail
      );
      if (matchedUser) {
        return { org: orgItem, user: matchedUser };
      }
    }

    return null;
  };

  const handleLicenseAssignEmailChange = (emailValue) => {
    setLicenseAssign((prev) => ({ ...prev, email: emailValue }));

    const email = emailValue.trim().toLowerCase();
    if (!email) {
      setLicenseAssignState({ mode: 'idle', message: '', user: null });
      return;
    }

    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      setLicenseAssignState({ mode: 'invalid', message: 'Invalid email format', user: null });
      return;
    }

    const isExpiredAssignment = (user) => {
      if (String(user.status || '').toLowerCase() === 'expired') {
        return true;
      }
      if (!user.expiryDate) {
        return false;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiryDate = new Date(user.expiryDate);
      if (Number.isNaN(expiryDate.getTime())) {
        return false;
      }
      expiryDate.setHours(0, 0, 0, 0);
      return expiryDate < today;
    };

    const existing = authorizedUsersWithEffectiveStatus.find(
      (user) => String(user.email || '').toLowerCase() === email
    );

    if (!existing) {
      const firstOtherOrgMatch = findCrossOrgMatchByEmail(email);

      if (firstOtherOrgMatch) {
        setLicenseAssignState({
          mode: 'cross_org_reassign',
          message: 'Existing global user found in another organization. This license will be linked without creating a duplicate account.',
          user: {
            ...firstOtherOrgMatch.user,
            sourceOrgName: firstOtherOrgMatch.org.name
          }
        });
        return;
      }

      setLicenseAssignState({
        mode: 'new',
        message: 'No existing account found. A new user account will be created and linked to this license.',
        user: null
      });
      return;
    }

    if (isExpiredAssignment(existing)) {
      setLicenseAssignState({
        mode: 'reassign',
        message: 'Same organization match found with an expired assignment. Access will move to this license.',
        user: existing
      });
      return;
    }

    setLicenseAssignState({
      mode: 'exists',
      message: 'This email already has an active assignment in this organization.',
      user: existing
    });
  };

  const handleLicenseAssignSubmit = async (event) => {
    event.preventDefault();
    if (!selectedLicenseForUsers) return;
    if (isDateExpired(selectedLicenseForUsers.expiryDate) || String(selectedLicenseForUsers.status || '').trim().toLowerCase() === 'expired') {
      showAlert(
        'error',
        organization.name,
        'This license has expired. You cannot add users to this license.'
      );
      return;
    }

    const mode = licenseAssignState.mode;
    const email = licenseAssign.email.trim();
    const name = licenseAssign.name.trim();
    const today = new Date().toISOString().split('T')[0];
    const resolvedExpiryDate = selectedLicenseExpiryDate || licenseAssignExpiryDate;
    const resolvedLicenseCode = String(selectedLicenseForUsers?.licenseCode || '').trim();

    if (!email || mode === 'idle' || mode === 'invalid' || mode === 'exists' || mode === 'other_org_exists') {
      return;
    }

    if (mode === 'new' && !name) {
      setLicenseAssignState((prev) => ({ ...prev, message: 'Name is required for new user creation' }));
      return;
    }

    const licenseSeatLimit = Number(selectedLicenseForUsers.count) || 0;
    const assignedToSelected = getActiveAssignedUserCountForLicense(
      selectedLicenseForUsers,
      authorizedUsersWithEffectiveStatus
    );
    const existingAssignment = licenseAssignState.user
      ? getLicenseAssignmentForUser(licenseAssignState.user, selectedLicenseForUsers)
      : null;
    const willIncreaseSelectedCount =
      mode === 'new' ||
      mode === 'cross_org_reassign' ||
      (mode === 'reassign' && (
        !existingAssignment ||
        String(getAssignmentStatusForLicense(existingAssignment, selectedLicenseForUsers) || '')
          .toLowerCase() === 'expired'
      ));

    if (willIncreaseSelectedCount && assignedToSelected >= licenseSeatLimit) {
      showAlert('error', organization.name, "Seats has been full you can't add extra user.", [
        `License Code: ${selectedLicenseForUsers.licenseCode || '-'}`,
        `Assigned Users: ${assignedToSelected}`,
        `Available Slots: 0`
      ]);
      return;
    }

    let updatedUsers = [...(organization.authorizedUsers || [])];

    if (mode === 'new') {
      const finalName = name;

      if (!finalName) {
        setLicenseAssignState((prev) => ({ ...prev, message: 'Name is required for user creation' }));
        return;
      }

      updatedUsers.push({
        id: `auth-${Date.now()}`,
        name: finalName,
        email,
        createdDate: today,
        expiryDate: resolvedExpiryDate,
        status: 'Invited',
        licenseId: selectedLicenseForUsers.id,
        licenseCode: resolvedLicenseCode || null,
        licenseAssignments: [
          {
            licenseId: selectedLicenseForUsers.id,
            licenseCode: resolvedLicenseCode || null,
            expiryDate: resolvedExpiryDate,
            status: 'Invited'
          }
        ]
      });
    }

    if (mode === 'reassign' && licenseAssignState.user) {
      updatedUsers = updatedUsers.map((user) =>
        user.id === licenseAssignState.user.id
          ? {
              ...user,
              status: getPortabilityStatus(user),
              expiryDate: resolvedExpiryDate,
              licenseId: selectedLicenseForUsers.id,
              licenseCode: resolvedLicenseCode || user.licenseCode || null,
              licenseAssignments: upsertLicenseAssignment(
                upsertLicenseAssignment(getUserLicenseAssignments(user), {
                  licenseId: user.licenseId || null,
                  licenseCode: user.licenseCode || null,
                  expiryDate: user.expiryDate,
                  status: 'Expired'
                }),
                {
                  licenseId: selectedLicenseForUsers.id,
                  licenseCode: resolvedLicenseCode || user.licenseCode || null,
                  expiryDate: resolvedExpiryDate,
                  status: getPortabilityStatus(user)
                }
              )
            }
          : user
      );
    }

    if (mode === 'cross_org_reassign' && licenseAssignState.user) {
      const fallbackNameFromEmail = email.split('@')[0] || '';
      updatedUsers.push({
        id: `auth-${Date.now()}`,
        name: name || licenseAssignState.user.name || fallbackNameFromEmail,
        email,
        createdDate: licenseAssignState.user.createdDate || today,
        expiryDate: resolvedExpiryDate,
        status: getPortabilityStatus(licenseAssignState.user),
        licenseId: selectedLicenseForUsers.id,
        licenseCode: resolvedLicenseCode || null,
        licenseAssignments: [
          {
            licenseId: selectedLicenseForUsers.id,
            licenseCode: resolvedLicenseCode || null,
            expiryDate: resolvedExpiryDate,
            status: getPortabilityStatus(licenseAssignState.user)
          }
        ]
      });
    }

    await updateOrganization(id, { authorizedUsers: updatedUsers });
    setShowLicenseAssignForm(false);
    setLicenseAssign({ email: '', name: '' });
    setLicenseAssignExpiryDate('');
    setLicenseAssignState({ mode: 'idle', message: '', user: null });
  };

  const filterData = (data, term) => {
    if (!term) return data;
    return data.filter(item => 
      Object.values(item).some(val => 
        String(val).toLowerCase().includes(term.toLowerCase())
      )
    );
  };

  const filterUsersByNameAndEmail = (users, term) => {
    if (!term) return users;
    const normalizedTerm = String(term).toLowerCase().trim();
    if (!normalizedTerm) return users;
    return users.filter((user) =>
      String(user.name || '').toLowerCase().includes(normalizedTerm) ||
      String(user.email || '').toLowerCase().includes(normalizedTerm)
    );
  };

  const filterByStatusAndDate = (data, filters, dateField) => {
    return data.filter((item) => {
      const matchesStatus = !filters.status || item.status === filters.status;
      const matchesDateFrom = !filters.dateFrom || new Date(item[dateField]) >= new Date(filters.dateFrom);
      const matchesDateTo = !filters.dateTo || new Date(item[dateField]) <= new Date(filters.dateTo);
      return matchesStatus && matchesDateFrom && matchesDateTo;
    });
  };

  const getAssignedUserCountForLicense = (license, users = []) => {
    return users.filter((user) => {
      const assignment = getLicenseAssignmentForUser(user, license);
      return Boolean(assignment);
    }).length;
  };

  const getActiveAssignedUserCountForLicense = (
    license,
    users = authorizedUsersWithEffectiveStatus
  ) => {
    return users.filter((user) => {
      const assignment = getLicenseAssignmentForUser(user, license);
      if (!assignment) return false;
      const assignmentStatus = getAssignmentStatusForLicense(assignment, license);
      return String(assignmentStatus || '').toLowerCase() !== 'expired';
    }).length;
  };

  const handleLicenseExport = (rows) => {
    const csv = [
      ['Created Date', 'No. of Licenses', 'Active Licenses', 'Expiry Date', 'Status'],
      ...rows.map((license) => [
        license.purchaseDate,
        license.count,
        `${getAssignedUserCountForLicense(license, organization.authorizedUsers || [])}/${license.count}`,
        license.expiryDate,
        license.status
      ])
    ].map((row) => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `license-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleAuthorizedExport = (rows) => {
    const csv = [
      ['Name', 'Email', 'Created Date', 'Expiry Date', 'Status'],
      ...rows.map((user) => [
        user.name,
        user.email,
        user.createdDate,
        user.expiryDate,
        user.status
      ])
    ].map((row) => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `authorized-users-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const renderDetailsTab = () => (
    <div className="details-section fade-in">
      <div className="details-grid">
        <div className="detail-item">
          <label>Organization Name</label>
          {isEditing ? (
            <input
              type="text"
              value={editedOrg.name}
              onChange={(e) => setEditedOrg({ ...editedOrg, name: sanitizeAlpha(e.target.value) })}
            />
          ) : (
            <p>{organization.name}</p>
          )}
        </div>

        <div className="detail-item">
          <label>Created Date</label>
          {isEditing && !isMyOrgMode ? (
            <input
              type="date"
              value={editedOrg.createdDate}
              onChange={(e) => setEditedOrg({ ...editedOrg, createdDate: e.target.value })}
            />
          ) : (
            <p>{organization.createdDate}</p>
          )}
        </div>

        <div className="detail-item status-row">
          <label>Status</label>
          {isEditing && !isMyOrgMode ? (
            <select
              value={editedOrg.status}
              onChange={(e) => setEditedOrg({ ...editedOrg, status: e.target.value })}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          ) : (
            <span className={`status-badge status-${organization.status.toLowerCase()}`}>
              {organization.status}
            </span>
          )}
        </div>
        
        <div className="detail-item">
          <label>Active Licenses</label>
          <p>{activeLicenses}</p>
        </div>
        
        <div className="detail-item">
          <label>Authorized Users</label>
          <p>{displayAuthorizedUsers}/{activeLicenses}</p>
        </div>
      </div>

      <div className="details-sections">
        <div className="detail-card">
          <h3>Address</h3>
          <div className="detail-subgrid">
            <div className="detail-item">
              <label>Street Line 1</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedOrg.address?.streetLine1 || ''}
                  onChange={(e) =>
                    setEditedOrg({
                      ...editedOrg,
                      address: { ...editedOrg.address, streetLine1: e.target.value }
                    })
                  }
                />
              ) : (
                <p>{organization.address?.streetLine1 || '-'}</p>
              )}
            </div>
            <div className="detail-item">
              <label>Street Line 2</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedOrg.address?.streetLine2 || ''}
                  onChange={(e) =>
                    setEditedOrg({
                      ...editedOrg,
                      address: { ...editedOrg.address, streetLine2: e.target.value }
                    })
                  }
                />
              ) : (
                <p>{organization.address?.streetLine2 || '-'}</p>
              )}
            </div>
            <div className="detail-item">
              <label>City</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedOrg.address?.city || ''}
                  onChange={(e) =>
                    setEditedOrg({
                      ...editedOrg,
                      address: { ...editedOrg.address, city: e.target.value }
                    })
                  }
                />
              ) : (
                <p>{organization.address?.city || '-'}</p>
              )}
            </div>
            <div className="detail-item">
              <label>State</label>
              {isEditing ? (
                <select
                  value={editedOrg.address?.state || ''}
                  onChange={(e) =>
                    setEditedOrg({
                      ...editedOrg,
                      address: { ...editedOrg.address, state: e.target.value }
                    })
                  }
                >
                  <option value="">Select State</option>
                  {STATE_OPTIONS.map((stateName) => (
                    <option key={stateName} value={stateName}>{stateName}</option>
                  ))}
                </select>
              ) : (
                <p>{organization.address?.state || '-'}</p>
              )}
            </div>
            <div className="detail-item">
              <label>Country</label>
              {isEditing ? (
                <select
                  value={editedOrg.address?.country || ''}
                  onChange={(e) =>
                    setEditedOrg({
                      ...editedOrg,
                      address: { ...editedOrg.address, country: e.target.value }
                    })
                  }
                >
                  <option value="">Select Country</option>
                  {COUNTRY_OPTIONS.map((countryName) => (
                    <option key={countryName} value={countryName}>{countryName}</option>
                  ))}
                </select>
              ) : (
                <p>{organization.address?.country || '-'}</p>
              )}
            </div>
            <div className="detail-item">
              <label>Pincode</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedOrg.address?.pincode || ''}
                  onChange={(e) =>
                    setEditedOrg({
                      ...editedOrg,
                      address: { ...editedOrg.address, pincode: sanitizeDigits(e.target.value, 6) }
                    })
                  }
                />
              ) : (
                <p>{organization.address?.pincode || '-'}</p>
              )}
            </div>
          </div>
        </div>

        <div className="detail-card">
          <h3>Contact Details</h3>
          <div className="contact-grid">
            <div className="contact-card">
              <h4>Contact 1</h4>
              <div className="detail-item">
                <label>Phone Number</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedOrg.contact?.primary?.phone || ''}
                    onChange={(e) =>
                      setEditedOrg({
                        ...editedOrg,
                        contact: {
                          ...editedOrg.contact,
                          primary: { ...editedOrg.contact?.primary, phone: sanitizeDigits(e.target.value, 10) }
                        }
                      })
                    }
                  />
                ) : (
                  <p>{organization.contact?.primary?.phone || '-'}</p>
                )}
              </div>
              <div className="detail-item">
                <label>Email</label>
                {isEditing ? (
                  <input
                    type="email"
                    value={editedOrg.contact?.primary?.email || ''}
                    onChange={(e) =>
                      setEditedOrg({
                        ...editedOrg,
                        contact: {
                          ...editedOrg.contact,
                          primary: { ...editedOrg.contact?.primary, email: e.target.value }
                        }
                      })
                    }
                  />
                ) : (
                  <p>{organization.contact?.primary?.email || '-'}</p>
                )}
              </div>
            </div>

            <div className="contact-card">
              <h4>Contact 2</h4>
              <div className="detail-item">
                <label>Phone Number</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedOrg.contact?.secondary?.phone || ''}
                    onChange={(e) =>
                      setEditedOrg({
                        ...editedOrg,
                        contact: {
                          ...editedOrg.contact,
                          secondary: { ...editedOrg.contact?.secondary, phone: sanitizeDigits(e.target.value, 10) }
                        }
                      })
                    }
                  />
                ) : (
                  <p>{organization.contact?.secondary?.phone || '-'}</p>
                )}
              </div>
              <div className="detail-item">
                <label>Email</label>
                {isEditing ? (
                  <input
                    type="email"
                    value={editedOrg.contact?.secondary?.email || ''}
                    onChange={(e) =>
                      setEditedOrg({
                        ...editedOrg,
                        contact: {
                          ...editedOrg.contact,
                          secondary: { ...editedOrg.contact?.secondary, email: e.target.value }
                        }
                      })
                    }
                  />
                ) : (
                  <p>{organization.contact?.secondary?.email || '-'}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="edit-actions">
          <button className="btn btn-secondary" onClick={handleCancel}>
            <XmarkCircle width={18} height={18} strokeWidth={2} />
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            <FloppyDisk width={18} height={18} strokeWidth={2} />
            Save Changes
          </button>
        </div>
      )}
    </div>
  );

  const renderLicenseHistoryTab = () => {
    const licensePrefix = getOrgLicensePrefix(organization.name, organization.id);
    const licensesWithDisplayIds = licensesWithEffectiveStatus.map((license, index) => ({
      ...license,
      licenseCode: license.licenseCode || formatLicenseCode(licensePrefix, index + 1)
    }));

    const filteredLicenses = filterByStatusAndDate(
      filterData(licensesWithDisplayIds, licenseSearchTerm),
      licenseFilters,
      'expiryDate'
    );
    
    return (
      <div className="tab-content fade-in">
        <div className="tab-header">
          <h3>License History</h3>
        </div>

        <div className="table-toolbar">
          <div className="search-bar">
            <Search width={20} height={20} strokeWidth={2} />
            <input
              type="text"
              placeholder="Search licenses..."
              value={licenseSearchTerm}
              onChange={(e) => setLicenseSearchTerm(e.target.value)}
            />
          </div>
          <div className="toolbar-actions">
            <button
              className={`btn btn-secondary ${showLicenseFilters ? 'active' : ''}`}
              onClick={() => setShowLicenseFilters(!showLicenseFilters)}
            >
              <Filter width={18} height={18} strokeWidth={2} />
              Filters
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleLicenseExport(filteredLicenses)}
            >
              <Download width={18} height={18} strokeWidth={2} />
              Export
            </button>
            {!isMyOrgMode && (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setShowCreateLicense(true)}
              >
                <Plus width={18} height={18} strokeWidth={2} />
                Create License
              </button>
            )}
          </div>
        </div>

        {showLicenseFilters && (
          <div className="advanced-filters fade-in">
            <div className="filter-grid">
              <div className="input-group">
                <label>Status</label>
                <select
                  value={licenseFilters.status}
                  onChange={(e) => setLicenseFilters({ ...licenseFilters, status: e.target.value })}
                >
                  <option value="">All Status</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>
              <div className="input-group">
                <label>Expires From</label>
                <input
                  type="date"
                  value={licenseFilters.dateFrom}
                  onChange={(e) => setLicenseFilters({ ...licenseFilters, dateFrom: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label>Expires To</label>
                <input
                  type="date"
                  value={licenseFilters.dateTo}
                  onChange={(e) => setLicenseFilters({ ...licenseFilters, dateTo: e.target.value })}
                />
              </div>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setLicenseFilters({ status: '', dateFrom: '', dateTo: '' })}
            >
              <XmarkCircle width={16} height={16} strokeWidth={2} />
              Clear Filters
            </button>
          </div>
        )}
        
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>License ID</th>
                <th>Created Date</th>
                <th>No. of Licenses</th>
                <th>Active Licenses</th>
                <th>Expiry Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLicenses.map((license) => (
                
                <tr key={license.id}>
                  {editingLicenseId === license.id ? (
                    <>
                      <td>{license.licenseCode}</td>
                      <td>
                        <input
                          type="date"
                          className="inline-edit"
                          value={editedLicense.purchaseDate}
                          onChange={(e) =>
                            setEditedLicense({ ...editedLicense, purchaseDate: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="inline-edit"
                          value={editedLicense.count}
                          onChange={(e) =>
                            setEditedLicense({
                              ...editedLicense,
                              count: parseInt(e.target.value, 10) || 0
                            })
                          }
                        />
                      </td>
                      <td>
                        {getAssignedUserCountForLicense(license, organization.authorizedUsers || [])}/{editedLicense.count}
                      </td>
                      <td>
                        <input
                          type="date"
                          className="inline-edit"
                          value={editedLicense.expiryDate}
                          onChange={(e) =>
                            setEditedLicense({ ...editedLicense, expiryDate: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <select
                          className="inline-edit"
                          value={editedLicense.status}
                          onChange={(e) => setEditedLicense({ ...editedLicense, status: e.target.value })}
                        >
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                          <option value="Expired">Expired</option>
                        </select>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="action-btn save-btn"
                            onClick={handleLicenseSave}
                            title="Save"
                          >
                            <FloppyDisk width={18} height={18} strokeWidth={2} />
                          </button>
                          <button
                            className="action-btn cancel-btn"
                            onClick={handleLicenseCancel}
                            title="Cancel"
                          >
                            <XmarkCircle width={18} height={18} strokeWidth={2} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><strong>{license.licenseCode}</strong></td>
                      <td>{license.purchaseDate}</td>
                      <td>{license.count}</td>
                      <td>{getAssignedUserCountForLicense(license, organization.authorizedUsers || [])}/{license.count}</td>
                      <td>{formatExpiryForUi(license.expiryDate)}</td>
                      <td>
                        <span className={`status-badge status-${license.status.toLowerCase()}`}>
                          {license.status}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          {isMyOrgMode ? (
                            <button
                              className="action-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                openLicenseUsersModal(license);
                              }}
                              title="View Users"
                            >
                              <Group width={18} height={18} strokeWidth={2} />
                            </button>
                          ) : (
                            <>
                              <button
                                className="action-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openLicenseUsersModal(license);
                                }}
                                title="View Users"
                              >
                                <Eye width={18} height={18} strokeWidth={2} />
                              </button>
                              <button
                                className="action-btn edit-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLicenseEdit(license);
                                }}
                                title="Edit"
                              >
                                <EditPencil width={18} height={18} strokeWidth={2} />
                              </button>
                              <button
                                className="action-btn delete-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requestLicenseDelete(license.id);
                                }}
                                title="Delete"
                              >
                                <Trash width={18} height={18} strokeWidth={2} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filteredLicenses.length === 0 && (
            <div className="empty-state">
              <p>No license history found</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAuthorizedUsersTab = () => {
    const licensePrefix = getOrgLicensePrefix(organization.name, organization.id);
    const licensesWithDisplayIds = licensesWithEffectiveStatus.map((license, index) => ({
      ...license,
      licenseCode: license.licenseCode || formatLicenseCode(licensePrefix, index + 1)
    }));

    const resolveLicenseCodeFromAssignment = (assignment) => {
      if (!assignment) return '';

      if (assignment.licenseCode) {
        return assignment.licenseCode;
      }

      const matchedLicenseById = assignment.licenseId
        ? licensesWithDisplayIds.find((license) => license.id === assignment.licenseId)
        : null;
      if (matchedLicenseById?.licenseCode) {
        return matchedLicenseById.licenseCode;
      }

      const matchedLicenseByExpiry = licensesWithDisplayIds.find((license) =>
        sameCalendarDate(license.expiryDate, assignment.expiryDate)
      );
      return matchedLicenseByExpiry?.licenseCode || '';
    };

    const getUserLicenseCode = (user) => {
      if (String(user.status || '').toLowerCase() === 'expired') {
        const expiredAssignment = getUserLicenseAssignments(user, licensesWithDisplayIds)
          .filter((assignment) => {
            const matchedLicense =
              (assignment.licenseId
                ? licensesWithDisplayIds.find((license) => license.id === assignment.licenseId)
                : null) ||
              licensesWithDisplayIds.find((license) =>
                sameCalendarDate(license.expiryDate, assignment.expiryDate)
              ) ||
              null;

            return getAssignmentStatusForLicense(assignment, matchedLicense) === 'Expired';
          })
          .sort((left, right) =>
            String(toCanonicalDate(right.expiryDate) || '').localeCompare(
              String(toCanonicalDate(left.expiryDate) || '')
            )
          )[0];

        const expiredLicenseCode = resolveLicenseCodeFromAssignment(expiredAssignment);
        if (expiredLicenseCode) {
          return expiredLicenseCode;
        }
      }

      const mappedLicense = getMappedLicenseForUser(user, licensesWithDisplayIds);
      return mappedLicense?.licenseCode || '';
    };

    // Show one row per license a person has ever held (not just their current one),
    // so a user who moved from an expired license to a new active one appears under
    // both statuses instead of only their latest.
    const authorizedUserRows = [];
    (organization.authorizedUsers || []).forEach((user) => {
      const assignments = getUserLicenseAssignments(user);
      const dedupedByLicense = new Map();
      assignments.forEach((assignment) => {
        const key =
          normalizeLicenseCodeValue(assignment.licenseCode) || assignment.licenseId || '';
        dedupedByLicense.set(key, assignment);
      });
      const uniqueAssignments = Array.from(dedupedByLicense.values());

      if (!uniqueAssignments.length) {
        authorizedUserRows.push({ ...user, rowKey: user.id });
        return;
      }

      uniqueAssignments.forEach((assignment, index) => {
        const isCurrentAssignment =
          (assignment.licenseCode &&
            normalizeLicenseCodeValue(assignment.licenseCode) === normalizeLicenseCodeValue(user.licenseCode)) ||
          (assignment.licenseId && user.licenseId && assignment.licenseId === user.licenseId);
        const assignmentLicense = findLicenseForAssignment(assignment);
        const isAssignmentLicenseCurrent = Boolean(
          assignmentLicense &&
          String(assignmentLicense.status || '').toLowerCase() !== 'expired' &&
          !isDateExpired(assignmentLicense.expiryDate)
        );

        // The top-level status is authoritative for whichever license it currently
        // matches (kept in sync by admin edits and the registration endpoint); the
        // nested assignment entry can go stale if the DB was edited directly.
        const status =
          isCurrentAssignment && isAssignmentLicenseCurrent
            ? String(user.status || '').toLowerCase() === 'expired'
              ? 'Expired'
              : user.status
            : getEffectiveAssignmentStatus(assignment);

        authorizedUserRows.push({
          ...user,
          rowKey: `${user.id}::${index}`,
          licenseId: assignment.licenseId || user.licenseId,
          licenseCode: assignment.licenseCode || user.licenseCode,
          expiryDate: assignment.expiryDate || user.expiryDate,
          status
        });
      });
    });

    const filteredUsers = filterByStatusAndDate(
      filterUsersByNameAndEmail(authorizedUserRows, userSearchTerm),
      userFilters,
      'expiryDate'
    );

    return (
      <div className="tab-content fade-in">
        <div className="tab-header">
          <h3>Authorized Users</h3>
        </div>

        <div className="table-toolbar">
          <div className="search-bar">
            <Search width={20} height={20} strokeWidth={2} />
            <input
              type="text"
              placeholder="Search users..."
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
            />
          </div>
          <div className="toolbar-actions">
            <button
              className={`btn btn-secondary ${showUserFilters ? 'active' : ''}`}
              onClick={() => setShowUserFilters(!showUserFilters)}
            >
              <Filter width={18} height={18} strokeWidth={2} />
              Filters
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleAuthorizedExport(filteredUsers)}
            >
              <Download width={18} height={18} strokeWidth={2} />
              Export
            </button>
          </div>
        </div>

        {showUserFilters && (
          <div className="advanced-filters fade-in">
            <div className="filter-grid">
              <div className="input-group">
                <label>Status</label>
                <select
                  value={userFilters.status}
                  onChange={(e) => setUserFilters({ ...userFilters, status: e.target.value })}
                >
                  <option value="">All Status</option>
                  <option value="Invited">Invited</option>
                  <option value="Registered">Registered</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>
              <div className="input-group">
                <label>Expiry Date From</label>
                <input
                  type="date"
                  value={userFilters.dateFrom}
                  onChange={(e) => setUserFilters({ ...userFilters, dateFrom: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label>Expiry Date To</label>
                <input
                  type="date"
                  value={userFilters.dateTo}
                  onChange={(e) => setUserFilters({ ...userFilters, dateTo: e.target.value })}
                />
              </div>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setUserFilters({ status: '', dateFrom: '', dateTo: '' })}
            >
              <XmarkCircle width={16} height={16} strokeWidth={2} />
              Clear Filters
            </button>
          </div>
        )}
        
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>License ID</th>
                <th>Created Date</th>
                <th>Expiry Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.rowKey}>
                  <td><strong>{user.name}</strong></td>
                  <td>{user.email}</td>
                  <td>{user.licenseCode || getUserLicenseCode(user)}</td>
                  <td>{user.createdDate}</td>
                  <td>{formatExpiryForUi(user.expiryDate)}</td>
                  <td>
                    <span className={`status-badge status-${user.status.toLowerCase()}`}>
                      {user.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && (
            <div className="empty-state">
              <p>No authorized users found</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const licenseScopedAllUsers = authorizedUsersWithEffectiveStatus
    .map((user) => {
      if (!selectedLicenseForUsers) return user;

      const assignment = getLicenseAssignmentForUser(user, selectedLicenseForUsers);
      if (!assignment) return null;

      const currentMappedLicense = getMappedLicenseForUser(user);
      const isCurrentAssignment = Boolean(
        currentMappedLicense && currentMappedLicense.id === selectedLicenseForUsers.id
      );
      const statusForSelectedLicense = isCurrentAssignment
        ? (String(user.status || '').trim() || getAssignmentStatusForLicense(assignment, selectedLicenseForUsers))
        : getAssignmentStatusForLicense(assignment, selectedLicenseForUsers);

      return {
        ...user,
        expiryDate: assignment.expiryDate || user.expiryDate,
        licenseId: assignment.licenseId || selectedLicenseForUsers.id,
        licenseCode:
          assignment.licenseCode ||
          selectedLicenseForUsers.licenseCode ||
          user.licenseCode ||
          null,
        status: statusForSelectedLicense,
        isHistoricalLicenseAssignment: Boolean(
          currentMappedLicense &&
            currentMappedLicense.id !== selectedLicenseForUsers.id &&
            statusForSelectedLicense === 'Expired'
        )
      };
    })
    .filter(Boolean);

  const licenseModalUsers = filterByStatusAndDate(
    filterData(licenseScopedAllUsers, licenseModalSearchTerm),
    licenseModalFilters,
    'expiryDate'
  );

  const licenseRegisteredCount = licenseScopedAllUsers.filter((u) => u.status === 'Registered').length;
  const licenseInvitedCount = licenseScopedAllUsers.filter((u) => u.status === 'Invited').length;
  const isSelectedLicenseExpired = Boolean(
    selectedLicenseForUsers &&
    (
      String(selectedLicenseForUsers.status || '').trim().toLowerCase() === 'expired' ||
      isDateExpired(selectedLicenseForUsers.expiryDate)
    )
  );
  const isSelectedLicenseFull = selectedLicenseForUsers
    ? getActiveAssignedUserCountForLicense(
        selectedLicenseForUsers,
        authorizedUsersWithEffectiveStatus
      ) >= (Number(selectedLicenseForUsers.count) || 0)
    : false;
  if (selectedLicenseForUsers) {
    return (
      <div className="organization-details-page fade-in">
        <div className="page-header">
          <div className="page-header-left">
            <button
              className="btn btn-secondary"
              onClick={() => {
                closeLicenseUsersModal();
                setActiveTab('licenses');
              }}
            >
              <ArrowLeft width={18} height={18} strokeWidth={2} />
              Back to License History
            </button>
            <h2>License - Expires {formatExpiryForUi(selectedLicenseForUsers.expiryDate)}</h2>
            <p className="license-users-subtitle">
              {selectedLicenseForUsers.count} seats - Created {selectedLicenseForUsers.purchaseDate}
            </p>
          </div>
        </div>

        <div className="license-users-summary">
          <div className="license-users-summary-card">
            <p>Total License</p>
            <h3>{selectedLicenseForUsers.count}</h3>
          </div>
          <div className="license-users-summary-card">
            <p>Invited</p>
            <h3>{licenseInvitedCount}</h3>
          </div>
          <div className="license-users-summary-card">
            <p>Registered</p>
            <h3>{licenseRegisteredCount}</h3>
          </div>
          <div className="license-users-summary-card">
            <p>Expires</p>
            <h3>{formatExpiryForUi(selectedLicenseForUsers.expiryDate)}</h3>
          </div>
        </div>

        <div className="table-toolbar license-users-toolbar">
          <div className="search-bar">
            <Search width={20} height={20} strokeWidth={2} />
            <input
              type="text"
              placeholder="Search users..."
              value={licenseModalSearchTerm}
              onChange={(e) => setLicenseModalSearchTerm(e.target.value)}
            />
          </div>
          <div className="toolbar-actions">
            <button
              className={`btn btn-secondary ${showLicenseModalFilters ? 'active' : ''}`}
              onClick={() => {
                resetAuthorizedInlineEditSection();
                resetLicenseAssignSection();
                setShowLicenseModalFilters(!showLicenseModalFilters);
              }}
            >
              <Filter width={18} height={18} strokeWidth={2} />
              Filters
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                resetAuthorizedInlineEditSection();
                resetLicenseAssignSection();
                handleAuthorizedExport(licenseModalUsers);
              }}
            >
              <Download width={18} height={18} strokeWidth={2} />
              Export
            </button>
            {isSelectedLicenseFull && (
              <span style={{ color: '#ef4444', fontWeight: 500, alignSelf: 'center' }}>
                Fully allocated
              </span>
            )}
            {!isSelectedLicenseExpired && !isSelectedLicenseFull && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  resetAuthorizedInlineEditSection();
                  setShowLicenseAssignForm((prev) => {
                    const next = !prev;
                    if (!next) {
                      setLicenseAssign({ email: '', name: '' });
                      setLicenseAssignExpiryDate('');
                      setLicenseAssignState({ mode: 'idle', message: '', user: null });
                    } else {
                      setLicenseAssignExpiryDate(selectedLicenseExpiryDate);
                      setLicenseAssignState({ mode: 'idle', message: '', user: null });
                    }
                    return next;
                  });
                }}
              >
                <Plus width={18} height={18} strokeWidth={2} />
                Create Authorized User
              </button>
            )}
          </div>
        </div>

        {showLicenseModalFilters && (
          <div className="advanced-filters fade-in license-users-filters">
            <div className="filter-grid">
              <div className="input-group">
                <label>Status</label>
                <select
                  value={licenseModalFilters.status}
                  onChange={(e) => setLicenseModalFilters({ ...licenseModalFilters, status: e.target.value })}
                >
                  <option value="">All Status</option>
                  <option value="Invited">Invited</option>
                  <option value="Registered">Registered</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>
              <div className="input-group">
                <label>Expires From</label>
                <input
                  type="date"
                  value={licenseModalFilters.dateFrom}
                  onChange={(e) => setLicenseModalFilters({ ...licenseModalFilters, dateFrom: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label>Expires To</label>
                <input
                  type="date"
                  value={licenseModalFilters.dateTo}
                  onChange={(e) => setLicenseModalFilters({ ...licenseModalFilters, dateTo: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}

        {showLicenseAssignForm && (
          <div className="license-add-user-card">
            <div className="license-add-user-header">
              <h3>Add User to This License</h3>
            </div>
            <form onSubmit={handleLicenseAssignSubmit}>
              <div className="license-add-user-info">
                Enter the user's email. The system detects if this is new or reassignment.
              </div>
              <div className="input-group">
                <label>Email *</label>
                <input
                  type="email"
                  required
                  placeholder="Enter email address..."
                  value={licenseAssign.email}
                  onChange={(e) => handleLicenseAssignEmailChange(e.target.value)}
                />
              </div>

              {licenseAssignState.mode === 'new' && (
                <div className="license-state-card license-state-new">
                  <p><strong>New User - Will Be Created</strong></p>
                  <p>{licenseAssignState.message}</p>
                  <div className="input-group" style={{ marginTop: '10px' }}>
                    <label>Name *</label>
                    <input
                      type="text"
                      placeholder="Enter full name"
                      value={licenseAssign.name}
                      onChange={(e) => setLicenseAssign((prev) => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {licenseAssignState.mode === 'reassign' && licenseAssignState.user && (
                <div className="license-state-card license-state-reassign">
                  <p><strong>Same Org Reassignment</strong></p>
                  <p>{licenseAssignState.message}</p>
                  <p>
                    {licenseAssignState.user.name} - {licenseAssignState.user.status}
                  </p>
                </div>
              )}

              {licenseAssignState.mode === 'exists' && (
                <div className="license-state-card license-state-exists">
                  <p><strong>User Already Assigned</strong></p>
                  <p>{licenseAssignState.message}</p>
                </div>
              )}

              {licenseAssignState.mode === 'other_org_exists' && (
                <div className="license-state-card license-state-exists">
                  <p><strong>User Exists In Another Organization</strong></p>
                  <p>{licenseAssignState.message}</p>
                </div>
              )}

              {licenseAssignState.mode === 'cross_org_reassign' && licenseAssignState.user && (
                <div className="license-state-card license-state-reassign">
                  <p><strong>Returning User (Cross-Organization)</strong></p>
                  <p>{licenseAssignState.message}</p>
                  <p>Existing profile: {licenseAssignState.user.name || '-'}</p>
                  <p>Status: {licenseAssignState.user.status || 'Expired'}</p>
                  <p>Source organization: {licenseAssignState.user.sourceOrgName || '-'}</p>
                </div>
              )}

              {licenseAssignState.mode === 'invalid' && (
                <div className="license-state-card license-state-exists">
                  <p><strong>Invalid Email</strong></p>
                  <p>{licenseAssignState.message}</p>
                </div>
              )}

              <div className="license-readonly-grid">
                <div className="input-group">
                  <label>License</label>
                  <div className="locked-input-wrap">
                    <input
                      type="text"
                      className="locked-display-input"
                      readOnly
                      title="License is fixed from selected license"
                      onFocus={(e) => e.target.blur()}
                      value={`${selectedLicenseForUsers.count} seats - Expires ${formatExpiryForUi(selectedLicenseForUsers.expiryDate)}`}
                    />
                    <span className="locked-input-icon" aria-hidden="true">[Locked]</span>
                  </div>
                </div>
	                <div className="input-group locked-expiry-group">
	                  <label>Expiry</label>
	                  <div className="locked-input-wrap">
	                    <input
	                      type="date"
	                      className="locked-display-input"
	                      value={selectedLicenseExpiryDate}
	                      readOnly
	                      disabled
	                      title="Expiry date is fixed from selected license"
	                      onFocus={(e) => e.target.blur()}
	                    />
	                    <span className="locked-input-icon" aria-hidden="true">[Locked]</span>
	                  </div>
	                </div>
	              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={resetLicenseAssignSection}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  onClick={(e) => {
                    if (!selectedLicenseForUsers) return;
                    if (isSelectedLicenseExpired) {
                      e.preventDefault();
                      e.stopPropagation();
                      showAlert(
                        'error',
                        organization.name,
                        'This license has expired. You cannot add users to this license.'
                      );
                      return;
                    }
                    const licenseSeatLimit = Number(selectedLicenseForUsers.count) || 0;
                    const assignedToSelected = getActiveAssignedUserCountForLicense(
                      selectedLicenseForUsers,
                      authorizedUsersWithEffectiveStatus
                    );
                    if (assignedToSelected >= licenseSeatLimit) {
                      e.preventDefault();
                      e.stopPropagation();
                      showAlert('error', organization.name, "Seats has been full you can't add extra user.", [
                        `License Code: ${selectedLicenseForUsers.licenseCode || '-'}`,
                        `Assigned Users: ${assignedToSelected}`,
                        `Available Slots: 0`
                      ]);
                    }
                  }}
                  disabled={
                    !isSelectedLicenseFull && (
                      licenseAssignState.mode === 'exists' ||
                      licenseAssignState.mode === 'other_org_exists' ||
                      licenseAssignState.mode === 'invalid' ||
                      licenseAssignState.mode === 'idle'
                    )
                  }
                >
                  {licenseAssignState.mode === 'reassign'
                    ? 'Reassign to This License'
                    : licenseAssignState.mode === 'cross_org_reassign'
                      ? 'Link User'
                      : 'Add User'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="table-container license-users-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Created Date</th>
                <th>Expires</th>
                <th>Status</th>
                {isMyOrgMode && <th>Level</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {licenseModalUsers.map((user) => (
                <tr key={user.id}>
                  {editingUserId === user.id ? (
                    <>
                      <td>
                        <input
                          type="text"
                          className="inline-edit"
                          value={editedUser.name}
                          onChange={(e) => setEditedUser({ ...editedUser, name: e.target.value })}
                        />
                      </td>
                      <td>{user.email}</td>
                      <td>{user.createdDate}</td>
                      <td>{formatExpiryForUi(user.expiryDate)}</td>
                      <td>
                        <select
                          className="inline-edit"
                          value={editedUser.status}
                          onChange={(e) => setEditedUser({ ...editedUser, status: e.target.value })}
                        >
                          <option value="Invited">Invited</option>
                          <option value="Registered">Registered</option>
                          <option value="Expired">Expired</option>
                        </select>
                      </td>
                      {isMyOrgMode && (
                        <td>
                          <select
                            className="inline-edit"
                            value={editedUser.level || ''}
                            onChange={(e) => setEditedUser({ ...editedUser, level: e.target.value })}
                          >
                            <option value="">-</option>
                            {currentLevels.map((lvl) => (
                              <option key={lvl.level} value={lvl.level}>{lvl.level}</option>
                            ))}
                          </select>
                        </td>
                      )}
                      <td>
                        <div className="action-buttons">
                          <button className="action-btn save-btn" onClick={handleAuthorizedSave} title="Save">
                            <FloppyDisk width={18} height={18} strokeWidth={2} />
                          </button>
                          <button className="action-btn cancel-btn" onClick={handleAuthorizedCancel} title="Cancel">
                            <XmarkCircle width={18} height={18} strokeWidth={2} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><strong>{user.name}</strong></td>
                      <td>{user.email}</td>
                      <td>{user.createdDate}</td>
                      <td>{formatExpiryForUi(user.expiryDate)}</td>
                      <td>
                        <span className={`status-badge status-${String(user.status).toLowerCase()}`}>
                          {user.status}
                        </span>
                      </td>
                      {isMyOrgMode && <td>{user.level || 'Beginner'}</td>}
                      <td>
                        <div className="action-buttons">
                          <button
                            className="action-btn edit-btn"
                            onClick={() => handleAuthorizedEdit(user)}
                            title="Edit"
                            disabled={!isMyOrgMode && user.isHistoricalLicenseAssignment}
                          >
                            <EditPencil width={18} height={18} strokeWidth={2} />
                          </button>
                          <button
                            className="action-btn delete-btn"
                            onClick={() => requestAuthorizedDelete(user.id)}
                            title="Delete"
                            disabled={user.isHistoricalLicenseAssignment}
                          >
                            <Trash width={18} height={18} strokeWidth={2} />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        {licenseModalUsers.length === 0 && (
          <div className="empty-state">
            <p>No authorized users found</p>
          </div>
        )}
      </div>
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
                ×
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
      {renderConfirmModal()}
    </div>
  );
  }

  const handleStartEditLevels = () => {
    setEditedLevels(currentLevels.map((lvl) => ({ ...lvl })));
    setIsEditingLevels(true);
  };

  const handleCancelEditLevels = () => {
    setIsEditingLevels(false);
  };

  const handleSaveLevels = async () => {
    await updateOrganization(id, { levelConfiguration: editedLevels });
    setIsEditingLevels(false);
  };

  const renderLevelConfigurationTab = () => (
    <div className="details-section fade-in">
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div className="page-header-left">
          <h3 style={{ margin: 0 }}>User Level Configuration</h3>
        </div>
        {!isEditingLevels && (
          <button className="btn btn-primary" onClick={handleStartEditLevels}>
            <EditPencil width={18} height={18} strokeWidth={2} />
            Edit
          </button>
        )}
      </div>
      <p style={{ color: '#64748b', marginTop: '-8px', marginBottom: '20px' }}>
        Set the starting virtual balance and the profit (gain) a learner must reach at each level
        before they're promoted to the next one. These values apply organization-wide.
      </p>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Level</th>
              <th>Starting Balance</th>
              <th>Gain Target</th>
            </tr>
          </thead>
          <tbody>
            {(isEditingLevels ? editedLevels : currentLevels).map((lvl, index) => (
              <tr key={lvl.level}>
                <td>{lvl.level}</td>
                <td>
                  {isEditingLevels ? (
                    <input
                      type="number"
                      value={editedLevels[index].startingBalance}
                      onChange={(e) => {
                        const updated = [...editedLevels];
                        updated[index] = { ...updated[index], startingBalance: e.target.value };
                        setEditedLevels(updated);
                      }}
                    />
                  ) : (
                    formatCurrency(lvl.startingBalance)
                  )}
                </td>
                <td>
                  {isEditingLevels ? (
                    <input
                      type="number"
                      value={editedLevels[index].gainTarget}
                      onChange={(e) => {
                        const updated = [...editedLevels];
                        updated[index] = { ...updated[index], gainTarget: e.target.value };
                        setEditedLevels(updated);
                      }}
                    />
                  ) : (
                    formatCurrency(lvl.gainTarget)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isEditingLevels && (
        <div className="edit-actions">
          <button className="btn btn-secondary" onClick={handleCancelEditLevels}>
            <XmarkCircle width={18} height={18} strokeWidth={2} />
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSaveLevels}>
            <FloppyDisk width={18} height={18} strokeWidth={2} />
            Save Changes
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="organization-details-page fade-in">
      <div className="page-header">
        <div className="page-header-left">
          {!isMyOrgMode && (
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/organizations')}
            >
              <ArrowLeft width={18} height={18} strokeWidth={2} />
              Back to Organizations
            </button>
          )}
          <h2>{organization.name}</h2>
        </div>
        {activeTab === 'details' && !isEditing && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditedOrg(normalizeOrg(organization));
              setIsEditing(true);
            }}
          >
            <EditPencil width={18} height={18} strokeWidth={2} />
            Edit
          </button>
        )}
      </div>

      <div className="summary-cards">
        {isMyOrgMode ? (
          <>
            <div className="summary-card">
              <p>Total License</p>
              <h3>{totalLicenseCount}</h3>
              <small style={{ color: '#64748b', fontSize: '12px' }}>Maximum purchased licenses</small>
            </div>
            <div className="summary-card">
              <p>Total Active License</p>
              <h3>{activeLicenses}</h3>
              <small style={{ color: '#64748b', fontSize: '12px' }}>Licenses currently active</small>
            </div>
            <div className="summary-card">
              <p>Authorized Users</p>
              <h3 style={{ color: displayAuthorizedUsers >= activeLicenses ? '#ef4444' : '#10b981' }}>
                {displayAuthorizedUsers}/{activeLicenses}
              </h3>
              <small style={{ color: '#64748b', fontSize: '12px' }}>
                {hasActiveLicense ? (canAddMoreUsers ? `${remainingLicenseSlots} slots available` : 'License limit reached') : 'No active licenses'}
              </small>
            </div>
            <div className="summary-card">
              <p>Total Invited Users</p>
              <h3>{invitedUsersCount}</h3>
              <small style={{ color: '#64748b', fontSize: '12px' }}>Pending registration</small>
            </div>
            <div className="summary-card">
              <p>Total Registered Users</p>
              <h3>{registeredUsersCount}</h3>
              <small style={{ color: '#64748b', fontSize: '12px' }}>Completed registration</small>
            </div>
            <div className="summary-card">
              <p>Total Expired Users</p>
              <h3>{expiredUsersCount}</h3>
              <small style={{ color: '#64748b', fontSize: '12px' }}>Access has expired</small>
            </div>
          </>
        ) : (
          <>
            <div className="summary-card">
              <p>Total Licenses</p>
              <h3>{totalLicenseCount}</h3>
              <small style={{ color: '#64748b', fontSize: '12px' }}>Maximum purchased licenses</small>
            </div>
            <div className="summary-card">
              <p>Authorized User</p>
              <h3 style={{ color: displayAuthorizedUsers >= activeLicenses ? '#ef4444' : '#10b981' }}>
                {displayAuthorizedUsers}/{activeLicenses}
              </h3>
              <small style={{ color: '#64748b', fontSize: '12px' }}>
                {hasActiveLicense ? (canAddMoreUsers ? `${remainingLicenseSlots} slots available` : 'License limit reached') : 'No active licenses'}
              </small>
            </div>
            <div className="summary-card">
              <p>Active Mobile Users</p>
              <h3>{registeredUsersCount}</h3>
              <small style={{ color: '#64748b', fontSize: '12px' }}>Users with Registered status</small>
            </div>
          </>
        )}
      </div>

      <div className="tabs-container">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => {
              closeConfirmModal();
              setActiveTab('details');
              setLicenseSearchTerm('');
              setUserSearchTerm('');
            }}
          >
            Details
          </button>
          <button
            className={`tab ${activeTab === 'licenses' ? 'active' : ''}`}
            onClick={() => {
              closeConfirmModal();
              setActiveTab('licenses');
              setLicenseSearchTerm('');
            }}
          >
            License History
          </button>
          <button
            className={`tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => {
              closeConfirmModal();
              setActiveTab('users');
              setUserSearchTerm('');
            }}
          >
            Authorized Users
          </button>
          {!isMyOrgMode && (
            <button
              className={`tab ${activeTab === 'org-admin-users' ? 'active' : ''}`}
              onClick={() => {
                closeConfirmModal();
                setActiveTab('org-admin-users');
              }}
            >
              Org Admin Users
            </button>
          )}
          {isMyOrgMode && (
            <button
              className={`tab ${activeTab === 'level-configuration' ? 'active' : ''}`}
              onClick={() => {
                closeConfirmModal();
                setActiveTab('level-configuration');
              }}
            >
              Level Configuration
            </button>
          )}
        </div>

        <div className="tab-content-container">
          {activeTab === 'details' && renderDetailsTab()}
          {activeTab === 'licenses' && renderLicenseHistoryTab()}
          {activeTab === 'users' && renderAuthorizedUsersTab()}
          {!isMyOrgMode && activeTab === 'org-admin-users' && renderOrgAdminUsersTab()}
          {isMyOrgMode && activeTab === 'level-configuration' && renderLevelConfigurationTab()}
        </div>
      </div>

      {showCreateLicense && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Create License History</h2>
              <button
                className="modal-close"
                onClick={() => {
                  setShowCreateLicense(false);
                  // Reset form state
                  setNewLicense({
                    expiryDate: '',
                    count: '0',
                    status: 'Active'
                  });
                }}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateLicense}>
              <div className="input-group">
                <label>No. of Licenses *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  value={newLicense.count}
                  onFocus={() => {
                    if (newLicense.count === '0') {
                      setNewLicense({ ...newLicense, count: '' });
                    }
                  }}
                  onBlur={() => {
                    if (!String(newLicense.count || '').trim()) {
                      setNewLicense({ ...newLicense, count: '0' });
                    }
                  }}
                  onChange={(e) =>
                    setNewLicense({
                      ...newLicense,
                      count: normalizeLicenseCountInput(e.target.value)
                    })
                  }
                />
              </div>
              <div className="input-group">
                <label>Expiry Date *</label>
                <input
                  type="date"
                  required
                  value={newLicense.expiryDate}
                  onChange={(e) => setNewLicense({ ...newLicense, expiryDate: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label>Status *</label>
                <select
                  value={newLicense.status}
                  onChange={(e) => setNewLicense({ ...newLicense, status: e.target.value })}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateLicense(false);
                    // Reset form state
                    setNewLicense({
                      expiryDate: '',
                      count: '0',
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

      {showCreateUser && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Create Authorized User</h2>
              <button
                className="modal-close"
                onClick={() => {
                  setShowCreateUser(false);
                  // Reset form state and validation
                  setNewAuthorizedUser({
                    name: '',
                    email: '',
                    expiryDate: ''
                  });
                  setEmailValidation({ message: '', type: '' });
                }}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateAuthorizedUser}>
              <div className="input-group">
                <label>Name *</label>
                <input
                  type="text"
                  required
                  value={newAuthorizedUser.name}
                  onChange={(e) => setNewAuthorizedUser({ ...newAuthorizedUser, name: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label>Email *</label>
                <input
                  type="email"
                  required
                  value={newAuthorizedUser.email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                />
                {emailValidation.message && (
                  <div style={{ 
                    fontSize: '12px', 
                    marginTop: '4px',
                    color: emailValidation.type === 'error' ? '#ef4444' : '#10b981'
                  }}>
                    {emailValidation.message}
                  </div>
                )}
                {isCheckingEmail && (
                  <div style={{ fontSize: '12px', marginTop: '4px', color: '#64748b' }}>
                    Checking email...
                  </div>
                )}
              </div>
              <div className="input-group">
                <label>Expiry Date *</label>
                <input
                  type="date"
                  required
                  value={newAuthorizedUser.expiryDate}
                  onChange={(e) => setNewAuthorizedUser({ ...newAuthorizedUser, expiryDate: e.target.value })}
                />
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateUser(false);
                    // Reset form state and validation
                    setNewAuthorizedUser({
                      name: '',
                      email: '',
                      expiryDate: ''
                    });
                    setEmailValidation({ message: '', type: '' });
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
                ×
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

      {renderConfirmModal()}
    </div>
  );
};

export default OrganizationDetails;







