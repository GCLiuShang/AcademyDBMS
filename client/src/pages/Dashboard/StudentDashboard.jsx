import React from 'react';
import BaseDashboard from './Dashboard';
import { getNavItemsByRole } from '../../config/navigation';

const StudentDashboard = () => {
  const { systemRole, queryItems, businessItems } = getNavItemsByRole('student');

  return <BaseDashboard systemRole={systemRole} queryItems={queryItems} businessItems={businessItems} />;
};

export default StudentDashboard;
