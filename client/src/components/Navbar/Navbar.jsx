import React from 'react';
import './Navbar.css';

const Navbar = ({ title, onLogout }) => {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        {title}
      </div>
      <div className="navbar-badge">
        <img src="/images/dashboard/badge.png" alt="Badge" />
      </div>
      <button className="logout-btn" onClick={onLogout}>
        注销登录
      </button>
    </nav>
  );
};

export default Navbar;