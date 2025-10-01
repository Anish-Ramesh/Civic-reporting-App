import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '../utils/Firebase';
import { isOfficial } from '../utils/FirebaseFunctions';

// Icons
const MenuIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const UserIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const Brand = () => (
  <Link 
    to="/" 
    className="flex items-center gap-2 group transition-all duration-200 hover:opacity-90 active:opacity-80"
    aria-label="mobilEASE - Home"
  >
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center group-hover:shadow-md transition-all">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="white"
        className="w-5 h-5"
        aria-hidden="true"
      >
        <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 5a1 1 0 10-2 0v5a1 1 0 00.553.894l4 2a1 1 0 10.894-1.788L13 10.618V7z" />
      </svg>
    </div>
    <span className="font-bold text-xl bg-gradient-to-r from-primary-600 to-primary-800 bg-clip-text text-transparent">
      Civic Mitra
    </span>
  </Link>
);

const NavItem = ({ to, onClick, children, isActive = false, variant = 'default', icon: Icon, className = '' }) => {
  const baseStyles = 'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200';
  
  const variants = {
    default: 'text-neutral-700 hover:bg-neutral-100',
    primary: 'bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 shadow-md hover:shadow-lg',
    outline: 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50',
    ghost: 'text-neutral-700 hover:bg-neutral-100',
    active: 'bg-primary-50 text-primary-700 font-semibold',
  };
  
  const variantClass = variants[variant] || variants.default;
  const activeClass = isActive ? variants.active : '';
  const iconClass = children ? 'mr-1' : '';
  
  const content = (
    <>
      {Icon && <Icon className={`w-4 h-4 ${iconClass}`} />}
      {children}
    </>
  );
  
  if (onClick) {
    return (
      <button 
        onClick={onClick} 
        className={`${baseStyles} ${variantClass} ${activeClass} ${className}`}
      >
        {content}
      </button>
    );
  }
  
  return (
    <Link 
      to={to} 
      className={`${baseStyles} ${variantClass} ${activeClass} ${className}`}
    >
      {content}
    </Link>
  );
};

const MobileMenu = ({ isOpen, onClose, user, official, handleLogout }) => {
  const location = useLocation();
  
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);
  
  useEffect(() => {
    onClose();
  }, [location.pathname]);
  
  const menuVariants = {
    hidden: { x: '100%' },
    visible: { 
      x: 0,
      transition: { 
        type: 'spring', 
        damping: 30, 
        stiffness: 300 
      } 
    },
    exit: { 
      x: '100%',
      transition: { 
        type: 'spring', 
        damping: 30, 
        stiffness: 300 
      } 
    }
  };
  
  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { duration: 0.2 }
    },
    exit: { 
      opacity: 0,
      transition: { duration: 0.2 }
    }
  };
  
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <motion.div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={overlayVariants}
            aria-hidden="true"
          />
          
          <motion.div 
            className="fixed inset-y-0 right-0 w-full max-w-xs bg-white shadow-2xl flex flex-col"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={menuVariants}
          >
            <div className="p-4 border-b border-neutral-100">
              <div className="flex items-center justify-between">
                <Brand />
                <button 
                  onClick={onClose}
                  className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 transition-colors"
                  aria-label="Close menu"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
            
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              <NavItem 
                to="/" 
                isActive={location.pathname === '/'}
                className="w-full justify-start"
              >
                Home
              </NavItem>
              
              {user ? (
                <>
                  <NavItem 
                    to={official ? "/official-dashboard" : "/citizen-dashboard"}
                    isActive={location.pathname.includes('dashboard')}
                    className="w-full justify-start"
                  >
                    Dashboard
                  </NavItem>
                  <NavItem 
                    to="/report" 
                    isActive={location.pathname === '/report'}
                    className="w-full justify-start"
                  >
                    Report Issue
                  </NavItem>
                  <NavItem 
                    to="/profile" 
                    isActive={location.pathname === '/profile'}
                    className="w-full justify-start"
                  >
                    My Profile
                  </NavItem>
                  <div className="pt-2 mt-4 border-t border-neutral-100">
                    <NavItem 
                      onClick={handleLogout} 
                      variant="outline"
                      className="w-full justify-center"
                    >
                      Sign Out
                    </NavItem>
                  </div>
                </>
              ) : (
                <div className="space-y-2 pt-2">
                  <NavItem 
                    to="/login" 
                    variant="primary"
                    className="w-full justify-center"
                  >
                    Sign In
                  </NavItem>
                  <NavItem 
                    to="/register" 
                    variant="outline"
                    className="w-full justify-center"
                  >
                    Create Account
                  </NavItem>
                </div>
              )}
            </nav>
            
            <div className="p-4 border-t border-neutral-100">
              <p className="text-xs text-neutral-500 text-center">
                © {new Date().getFullYear()} mobilEASE. All rights reserved.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [official, setOfficial] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  
  const handleLogout = async () => {
    try {
      await auth.signOut();
      setUser(null);
      setOfficial(false);
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };
  
  useEffect(() => {
    const handleScroll = () => {
      const offset = window.scrollY;
      if (offset > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setUser(user);
        try {
          const isUserOfficial = await isOfficial(user.uid);
          setOfficial(isUserOfficial);
        } catch (error) {
          console.error('Error checking user role:', error);
        }
      } else {
        setUser(null);
        setOfficial(false);
      }
    });
    
    return () => unsubscribe();
  }, []);
  
  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };
  
  const navbarClasses = [
    'sticky top-0 z-40 transition-all duration-300',
    isScrolled || isMenuOpen ? 'bg-white/95 backdrop-blur-md shadow-sm py-0' : 'bg-white/80 backdrop-blur-sm py-1',
    'border-b border-neutral-100',
  ].join(' ');
  
  return (
    <>
      <header className={navbarClasses}>
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Brand />
              
              <nav className="hidden md:flex ml-10 space-x-1">
                <NavItem 
                  to="/" 
                  isActive={location.pathname === '/'}
                >
                  Home
                </NavItem>
                
                {user && (
                  <>
                    <NavItem 
                      to={official ? "/official-dashboard" : "/citizen-dashboard"}
                      isActive={location.pathname.includes('dashboard')}
                    >
                      Dashboard
                    </NavItem>
                    <NavItem 
                      to="/report"
                      isActive={location.pathname === '/report'}
                    >
                      Report Issue
                    </NavItem>
                  </>
                )}
              </nav>
            </div>
            
            <div className="hidden md:flex items-center space-x-2">
              {user ? (
                <>
                  <NavItem 
                    to="/profile" 
                    variant="ghost"
                    icon={UserIcon}
                    isActive={location.pathname === '/profile'}
                    className="w-10 h-10 justify-center p-0 rounded-full"
                    aria-label="Profile"
                  />
                  <NavItem 
                    onClick={handleLogout} 
                    variant="outline"
                  >
                    Sign Out
                  </NavItem>
                </>
              ) : (
                <>
                  <NavItem to="/login" variant="ghost">
                    Sign In
                  </NavItem>
                  <NavItem to="/register" variant="primary">
                    Get Started
                  </NavItem>
                </>
              )}
            </div>
            
            <div className="flex md:hidden">
              <button
                onClick={toggleMenu}
                className="p-2 rounded-lg text-neutral-700 hover:bg-neutral-100 transition-colors"
                aria-label="Toggle menu"
                aria-expanded={isMenuOpen}
              >
                {isMenuOpen ? <CloseIcon /> : <MenuIcon />}
              </button>
            </div>
          </div>
        </div>
      </header>
      
      <MobileMenu 
        isOpen={isMenuOpen} 
        onClose={toggleMenu}
        user={user}
        official={official}
        handleLogout={handleLogout}
      />
    </>
  );
};

export default Navbar;
