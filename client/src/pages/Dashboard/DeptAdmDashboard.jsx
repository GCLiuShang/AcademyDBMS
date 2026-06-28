import React from 'react';
import BaseDashboard from './Dashboard';
import { getNavItemsByRole } from '../../config/navigation';

const DeptAdmDashboard = () => {
  const { systemRole, businessItems } = getNavItemsByRole('deptadmin');

  return <BaseDashboard systemRole={systemRole} businessItems={businessItems} />;
};

export default DeptAdmDashboard;
