import React from 'react';
import BaseDashboard from './Dashboard';

const ProfessorDashboard = () => {
  const businessItems = [
    { id: 'professor-biz-account', label: '账户设置', icon: '/images/dashboard/account.svg', url: '/accountsettings' },
    { id: 'professor-biz-curricularapply', label: '开课申请', icon: '/images/dashboard/curricularapply.svg', url: '/curricularapply' },
    { id: 'professor-biz-courseapply', label: '任教申请', icon: '/images/dashboard/courseapply.svg', url: '/courseapply' },
    { id: 'professor-biz-courseajust', label: '任课调整', icon: '/images/dashboard/courseajust.svg', url: '/courseajust' },
    { id: 'professor-biz-gradeinput', label: '成绩录入', icon: '/images/dashboard/gradeinput.svg', url: '/gradeinput' },
  ];

  return <BaseDashboard systemRole="教授" businessItems={businessItems} />;
};

export default ProfessorDashboard;
