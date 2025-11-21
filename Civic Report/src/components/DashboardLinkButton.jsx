import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';

const DashboardLinkButton = ({
  name,
  icon: Icon,
  link,
  onClick,
  className = '',
  subtitle,
  color = 'primary',
}) => {
  const colorVariants = {
    primary: 'from-primary-500 to-primary-600',
    secondary: 'from-secondary-500 to-secondary-600',
    success: 'from-success-500 to-success-600',
    warning: 'from-warning-500 to-warning-600',
    danger: 'from-danger-500 to-danger-600',
  };

  const iconColorVariants = {
    primary: 'text-primary-600',
    secondary: 'text-secondary-600',
    success: 'text-success-600',
    warning: 'text-warning-600',
    danger: 'text-danger-600',
  };

  // Create the content that will be wrapped in either a Link or a button
  const content = (
    <div className="h-full flex flex-col items-center justify-center p-6 md:p-8 rounded-2xl bg-white border border-neutral-100 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden relative">
      {/* Background gradient effect */}
      <div 
        className={`absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-10 transition-opacity duration-300 ${colorVariants[color]}`}
        aria-hidden="true"
      />
      
      {/* Icon container */}
      <div 
        className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center mb-6 transition-colors duration-200 bg-opacity-10 group-hover:bg-opacity-20 ${iconColorVariants[color]} bg-${color}-500`}
      >
        {React.isValidElement(Icon) ? (
          <div className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center">
            {Icon}
          </div>
        ) : (
          <Icon className="w-8 h-8 md:w-10 md:h-10" />
        )}
      </div>
      
      {/* Content */}
      <div className="text-center">
        <h3 className="text-lg md:text-xl font-semibold text-neutral-900 mb-2 group-hover:text-neutral-800 transition-colors">
          {name}
        </h3>
        {subtitle && (
          <p className="text-sm md:text-base text-neutral-500 mt-1 max-w-xs mx-auto">
            {subtitle}
          </p>
        )}
      </div>
      
      {/* Hover indicator */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </div>
  );

  return (
    <motion.div 
      className={`h-full ${className}`}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 400, damping: 10 }}
    >
      {link ? (
        <Link
          to={link}
          onClick={onClick}
          className="h-full block group"
          aria-label={name}
        >
          {content}
        </Link>
      ) : (
        <button
          onClick={onClick}
          className="h-full w-full block group"
          aria-label={name}
        >
          {content}
        </button>
      )}
    </motion.div>
  );
};

DashboardLinkButton.propTypes = {
  name: PropTypes.string.isRequired,
  // Accept either a rendered element (<Icon />) or a component type (Icon)
  icon: PropTypes.oneOfType([PropTypes.elementType, PropTypes.element]).isRequired,
  link: PropTypes.string,
  onClick: PropTypes.func,
  className: PropTypes.string,
  subtitle: PropTypes.string,
  color: PropTypes.oneOf(['primary', 'secondary', 'success', 'warning', 'danger']),
};

export default DashboardLinkButton;
