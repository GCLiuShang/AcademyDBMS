import React from 'react';
import BaseDashboard from './Dashboard';

const StudentDashboard = () => {
  const queryItems = [
    { id: 'student-query-course', label: '课程安排', icon: '/images/dashboard/course.svg' },
    { id: 'student-query-tp', label: '培养方案', icon: '/images/dashboard/trainingprogram.svg' },
    { id: 'student-query-grade', label: '成绩查询', icon: '/images/dashboard/grade.svg' },
    { id: 'student-query-exam', label: '考试安排', icon: '/images/dashboard/exam.svg' },
    { id: 'student-query-classroom', label: '教室查询', icon: '/images/dashboard/classroom.svg' },
  ];

  const businessItems = [
    { id: 'student-biz-account', label: '账户设置', icon: '/images/dashboard/account.svg', url: '/accountsettings' },
    { id: 'student-biz-enroll', label: '选择课程', icon: '/images/dashboard/enroll.svg', url: '/enroll' },
    { id: 'student-biz-delay', label: '缓考申请', icon: '/images/dashboard/delay.svg' },
  ];

  return <BaseDashboard systemRole="学生" queryItems={queryItems} businessItems={businessItems} />;
};

export default StudentDashboard;
