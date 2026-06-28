import React from 'react';
import BaseDashboard from './Dashboard';
import { getNavItemsByRole } from '../../config/navigation';

const ProfessorDashboard = () => {
  const { systemRole, businessItems } = getNavItemsByRole('professor');

  return <BaseDashboard systemRole={systemRole} businessItems={businessItems} />;
};

export default ProfessorDashboard;
