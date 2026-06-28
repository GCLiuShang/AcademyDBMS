import React, { useState, useEffect } from 'react';
import './Navbar.css';

const Navbar = ({ title, onLogout, onToggleMenu }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (menuOpen) {
      const timer = setTimeout(() => setMenuOpen(false), 100);
      return () => clearTimeout(timer);
    }
  }, [menuOpen]);

  const handleToggle = () => {
    setMenuOpen((prev) => !prev);
    if (onToggleMenu) onToggleMenu();
  };

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <button className={`navbar-menu-btn ${menuOpen ? 'open' : ''}`} onClick={handleToggle} aria-label="打开菜单" type="button">
          <span className="hamburger-lines">
            <span className="hamburger-line" />
            <span className="hamburger-line" />
            <span className="hamburger-line" />
          </span>
        </button>
        <div className="navbar-divider" />
        <div className="navbar-brand">{title}</div>
      </div>
      <div className="navbar-badge">
        <img src="/images/dashboard/badge.png" alt="Badge" className="navbar-badge-img" />
      </div>
      <button className="logout-btn" onClick={onLogout}>
        注销登录
      </button>
    </nav>
  );
};

export default Navbar;
