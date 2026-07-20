import React from 'react';
import { useApp } from '../context/AppContext';
import OrganizationDetails from './OrganizationDetails';

const MyOrganization = () => {
  const { currentUser } = useApp();

  if (!currentUser?.organizationId) {
    return (
      <div className="organization-details-page fade-in">
        <h2>My Organization</h2>
        <p style={{ color: '#64748b' }}>
          No organization is linked to your account yet. Contact your administrator.
        </p>
      </div>
    );
  }

  return <OrganizationDetails orgIdOverride={currentUser.organizationId} />;
};

export default MyOrganization;
