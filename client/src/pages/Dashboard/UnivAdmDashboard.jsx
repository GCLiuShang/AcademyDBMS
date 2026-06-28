import React from 'react';
import BaseDashboard from './Dashboard';
import { getNavItemsByRole } from '../../config/navigation';

const UnivAdmDashboard = () => {
  const { systemRole, businessItems } = getNavItemsByRole('univadmin');

  return <BaseDashboard systemRole={systemRole} businessItems={businessItems} />;
};

export default UnivAdmDashboard;
