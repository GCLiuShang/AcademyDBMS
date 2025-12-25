import React from 'react';
import BaseDashboard from './Dashboard';

const DepmAdmDashboard = () => {
  const businessItems = [
    { id: 'deptadmin-biz-account', label: '账户设置', icon: '/images/dashboard/account.svg', url: '/accountsettings' },
    { id: 'deptadmin-biz-curricularapply', label: '开课申请', icon: '/images/dashboard/curricularapply.svg', url: '/curricularapply' },
    { id: 'deptadmin-biz-curricularapprove', label: '开课审批', icon: '/images/dashboard/curricularapprove.svg', url: '/curricularapprove' },
    { id: 'deptadmin-biz-examapply', label: '考试申请', icon: '/images/dashboard/exam.svg', url: '/examapply' },
    { id: 'deptadmin-biz-examarrange', label: '考试安排', icon: '/images/dashboard/examarrange.svg', url: '/examarrange' },
  ];

  return <BaseDashboard systemRole="学院教学办管理员" businessItems={businessItems} />;
};

export default DepmAdmDashboard;
