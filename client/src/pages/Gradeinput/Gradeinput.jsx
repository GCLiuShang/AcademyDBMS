import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';

const getCurrentUserFromStorage = () => {
  try {
    const currentUno = sessionStorage.getItem('currentUno');
    if (currentUno) {
      const mapStr = localStorage.getItem('userMap');
      if (mapStr) {
        const map = JSON.parse(mapStr);
        if (map && typeof map === 'object' && map[currentUno]) {
          return map[currentUno];
        }
      }
    }
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
};

const Gradeinput = () => {
  const navigate = useNavigate();
  const [userInfo] = useState(() => {
    return getCurrentUserFromStorage();
  });

  const handleLogout = () => {
    navigate('/login');
  };

  const getSystemRole = () => {
    if (!userInfo) return '';
    return userInfo.Urole;
  };

  return (
    <MorePageLayout
      title="成绩录入"
      systemRole={getSystemRole()}
      onLogout={handleLogout}
      onNavigate={(item) => navigate(item.url)}
    >
      <div style={{ height: '100%', width: '100%' }} />
    </MorePageLayout>
  );
};

export default Gradeinput;
