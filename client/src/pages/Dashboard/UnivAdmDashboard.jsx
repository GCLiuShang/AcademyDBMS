import React from 'react';
import BaseDashboard from './Dashboard';

const UnivAdmDashboard = () => {
  const businessItems = [
    { id: 'univadmin-biz-account', label: '账户设置', icon: '/images/dashboard/account.svg', url: '/accountsettings' },
    { id: 'univadmin-biz-curricularapprove', label: '开课审批', icon: '/images/dashboard/curricularapprove.svg', url: '/curricularapprove' },
    { id: 'univadmin-biz-arrange', label: '事务安排', icon: '/images/dashboard/arrange.svg', url: '/arrange' },
    { id: 'univadmin-biz-useradd', label: '用户新增', icon: '/images/dashboard/useradd.svg', url: '/useradd' },
    { id: 'univadmin-biz-control', label: '业务控制', icon: '/images/dashboard/control.svg', url: '/control' },
  ];

  return <BaseDashboard systemRole="学校教务处管理员" businessItems={businessItems} />;
};

export default UnivAdmDashboard;
