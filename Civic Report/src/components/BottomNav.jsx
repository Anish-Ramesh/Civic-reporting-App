import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

// Icons
const HomeIcon = ({ isActive }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    className={`h-6 w-6 ${isActive ? 'text-primary-600' : 'text-neutral-500'}`}
    fill="none" 
    viewBox="0 0 24 24" 
    stroke="currentColor"
    strokeWidth={2}
  >
    <path 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" 
    />
  </svg>
);

const CreateIcon = ({ isActive }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    className={`h-6 w-6 ${isActive ? 'text-primary-600' : 'text-neutral-500'}`}
    fill="none" 
    viewBox="0 0 24 24" 
    stroke="currentColor"
    strokeWidth={2}
  >
    <path 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      d="M12 6v6m0 0v6m0-6h6m-6 0H6" 
    />
  </svg>
);

const TrackIcon = ({ isActive }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    className={`h-6 w-6 ${isActive ? 'text-primary-600' : 'text-neutral-500'}`}
    fill="none" 
    viewBox="0 0 24 24" 
    stroke="currentColor"
    strokeWidth={2}
  >
    <path 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" 
    />
  </svg>
);

const ProfileIcon = ({ isActive }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    className={`h-6 w-6 ${isActive ? 'text-primary-600' : 'text-neutral-500'}`}
    fill="none" 
    viewBox="0 0 24 24" 
    stroke="currentColor"
    strokeWidth={2}
  >
    <path 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" 
    />
  </svg>
);

const Tab = ({ to, label, icon: Icon }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <NavLink
      to={to}
      className={`flex flex-col items-center justify-center py-2 px-1 relative transition-colors duration-200`}
      aria-label={label}
    >
      <div className="flex flex-col items-center">
        <Icon isActive={isActive} />
        <span 
          className={`mt-1 text-xs font-medium transition-colors duration-200 ${
            isActive ? 'text-primary-600' : 'text-neutral-500'
          }`}
        >
          {label}
        </span>
      </div>
      {isActive && (
        <motion.div 
          className="absolute -top-1 h-1 w-1/2 bg-primary-500 rounded-full"
          layoutId="nav-indicator"
          initial={false}
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 30
          }}
        />
      )}
    </NavLink>
  );
};

const BottomNav = () => {
  return (
    <nav 
      className="fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-lg border-t border-neutral-100 shadow-lg"
      aria-label="Main navigation"
    >
      <div className="max-w-md mx-auto px-2">
        <div className="grid grid-cols-4">
          <Tab to="/feed" label="Home" icon={HomeIcon} />
          <Tab to="/report" label="Report" icon={CreateIcon} />
          <Tab to="/track-complaints" label="Track" icon={TrackIcon} />
          <Tab to="/profile" label="Profile" icon={ProfileIcon} />
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
