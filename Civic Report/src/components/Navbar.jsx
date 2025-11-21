import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, User as UserIcon, Home as HomeIcon, LayoutDashboard, AlertCircle, LogOut, BarChart3, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MobileSelect from './ui/MobileSelect.jsx';
import { auth } from '../utils/Firebase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Google Translate supported languages shown in UI
const LANGS = [
  // Core + Indian languages
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'bn', label: 'Bengali (বাংলা)' },
  { code: 'ta', label: 'Tamil (தமிழ்)' },
  { code: 'te', label: 'Telugu (తెలుగు)' },
  { code: 'mr', label: 'Marathi (मराठी)' },
  { code: 'gu', label: 'Gujarati (ગુજરાતી)' },
  { code: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ml', label: 'Malayalam (മലയാളം)' },
  { code: 'pa', label: 'Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'or', label: 'Odia (ଓଡ଼ିଆ)' },
  { code: 'ur', label: 'Urdu (اردو)' },
  { code: 'as', label: 'Assamese (অসমীয়া)' },
  { code: 'ne', label: 'Nepali (नेपाली)' },
  { code: 'sd', label: 'Sindhi (سنڌي)' },
  { code: 'si', label: 'Sinhala (සිංහල)' },
  { code: 'sa', label: 'Sanskrit (संस्कृतम्)' },
  { code: 'bho', label: 'Bhojpuri (भोजपुरी)' },
  { code: 'gom', label: 'Konkani (कोंकणी)' },
  { code: 'mai', label: 'Maithili (मैथिली)' },
  // Note: Some Indian languages may not be fully supported in website translate yet.
  // Popular foreign languages
  { code: 'fr', label: 'French (Français)' },
  { code: 'de', label: 'German (Deutsch)' },
  { code: 'es', label: 'Spanish (Español)' },
  { code: 'pt', label: 'Portuguese (Português)' },
  { code: 'it', label: 'Italian (Italiano)' },
  { code: 'tr', label: 'Turkish (Türkçe)' },
  { code: 'vi', label: 'Vietnamese (Tiếng Việt)' },
  { code: 'id', label: 'Indonesian (Bahasa Indonesia)' },
  { code: 'ms', label: 'Malay (Bahasa Melayu)' },
  { code: 'th', label: 'Thai (ไทย)' },
  { code: 'nl', label: 'Dutch (Nederlands)' },
  { code: 'pl', label: 'Polish (Polski)' },
  { code: 'sv', label: 'Swedish (Svenska)' },
  { code: 'da', label: 'Danish (Dansk)' },
  { code: 'no', label: 'Norwegian (Norsk)' },
  { code: 'cs', label: 'Czech (Čeština)' },
  { code: 'el', label: 'Greek (Ελληνικά)' },
  { code: 'he', label: 'Hebrew (עברית)' },
  { code: 'hu', label: 'Hungarian (Magyar)' },
  { code: 'ro', label: 'Romanian (Română)' },
  { code: 'uk', label: 'Ukrainian (Українська)' },
  { code: 'tl', label: 'Filipino (Tagalog)' },
  { code: 'bg', label: 'Bulgarian (Български)' },
  { code: 'hr', label: 'Croatian (Hrvatski)' },
  { code: 'sr', label: 'Serbian (Српски)' },
  { code: 'sk', label: 'Slovak (Slovenčina)' },
  { code: 'sl', label: 'Slovenian (Slovenščina)' },
  { code: 'fi', label: 'Finnish (Suomi)' },
  { code: 'et', label: 'Estonian (Eesti)' },
  { code: 'lt', label: 'Lithuanian (Lietuvių)' },
  { code: 'lv', label: 'Latvian (Latviešu)' },
  { code: 'am', label: 'Amharic (አማርኛ)' },
  { code: 'sw', label: 'Swahili (Kiswahili)' },
  { code: 'af', label: 'Afrikaans' },
  { code: 'yo', label: 'Yoruba (Yòrùbá)' },
  { code: 'zu', label: 'Zulu (isiZulu)' },
  { code: 'km', label: 'Khmer (ខ្មែរ)' },
  { code: 'lo', label: 'Lao (ລາວ)' },
  { code: 'my', label: 'Burmese (မြန်မာ)' },
  { code: 'ru', label: 'Russian (Русский)' },
  { code: 'ja', label: 'Japanese (日本語)' },
  { code: 'ko', label: 'Korean (한국어)' },
  { code: 'zh-CN', label: 'Chinese (简体)' },
  { code: 'zh-TW', label: 'Chinese (繁體)' },
];

// Read current language from googtrans cookie
const getCurrentTranslateLang = () => {
  try {
    const match = document.cookie.match(/(?:^|; )googtrans=([^;]*)/);
    if (!match) return 'en';
    const value = decodeURIComponent(match[1]);
    // value format: /auto/hi or /en/hi
    const parts = value.split('/');
    return parts[parts.length - 1] || 'en';
  } catch { return 'en'; }
};

// Set googtrans cookie and reload to apply translation
const setTranslateLang = (lang) => {
  try {
    const cookieVal = `/auto/${lang}`;
    const domain = window.location.hostname;
    document.cookie = `googtrans=${cookieVal}; path=/;`;
    document.cookie = `googtrans=${cookieVal}; path=/; domain=.${domain}`;
    localStorage.setItem('preferred_lang', lang);
    // If the translate element is loaded, trigger a reload to apply
    window.location.reload();
  } catch (e) {
    console.error('Failed to set translation language', e);
  }
};

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

const Brand = ({ onClick }) => (
  <Link 
    to="/" 
    onClick={onClick}
    className="flex items-center gap-2 group transition-all duration-200 hover:opacity-90 active:opacity-80"
    aria-label="mobilEASE - Home"
  >
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center group-hover:shadow-md transition-all">
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
    <span className="font-bold text-xl bg-gradient-to-r from-emerald-600 to-emerald-800 bg-clip-text text-transparent">
      Civic Mitra
    </span>
  </Link>
);

const NavItem = ({ to, onClick, children, isActive = false, variant = 'default', icon: Icon, className = '' }) => {
  const baseStyles = 'flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors';
  const variants = {
    default: 'text-gray-700 hover:bg-gray-100',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
  };

  const content = (
    <>
      {Icon && <Icon className="mr-3 h-5 w-5 flex-shrink-0" />}
      {children}
    </>
  );
  
  if (onClick) {

    return (
      <button 
        onClick={onClick} 
        className={`${baseStyles} ${variants[variant]} ${isActive ? '!bg-emerald-50 !text-emerald-700' : ''} ${className}`}
      >
        {content}
      </button>
    );
  }

  if (to) {
    return (
      <Link 
        to={to} 
        onClick={onClick}
        className={`${baseStyles} ${variants[variant]} ${isActive ? '!bg-emerald-50 !text-emerald-700' : ''} ${className}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <button 
      onClick={onClick} 
      className={`${baseStyles} ${variants[variant]} ${isActive ? '!bg-emerald-50 !text-emerald-700' : ''} ${className}`}
    >
      {content}
    </button>
  );
};

const MobileMenu = ({ isOpen, onClose, user, official, handleLogout, location, onNavigate, children }) => {
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
  
  const menuVariants = {
    open: { 
      opacity: 1,
      x: 0,
      transition: { 
        type: 'spring',
        stiffness: 300,
        damping: 30
      }
    },
    closed: { 
      opacity: 0,
      x: '100%',
      transition: { 
        type: 'spring',
        stiffness: 300,
        damping: 30
      }
    }
  };
  
  const overlayVariants = {
    open: { 
      opacity: 1,
      transition: { duration: 0.3 }
    },
    closed: { 
      opacity: 0,
      transition: { duration: 0.3, delay: 0.2 }
    }
  };
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={overlayVariants}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
            aria-hidden="true"
          />
          
          <motion.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={menuVariants}
            className="fixed top-0 right-0 h-full w-64 bg-white shadow-xl z-50 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex justify-between items-center mb-6">
              <Brand onClick={onClose} />
              <button
                onClick={onClose}
                className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none"
                aria-label="Close menu"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <nav className="flex flex-col space-y-2">
              {user && user.uid ? (
                <>
                  {/* Show Home and Report Issue only for citizens */}
                  {!official && (
                    <>
                      <NavItem 
                        to="/feed" 
                        onClick={() => onNavigate('/feed')}
                        icon={HomeIcon}
                        isActive={location.pathname === '/feed'}
                      >
                        Home
                      </NavItem>
                      <NavItem 
                        to="/citizen-dashboard" 
                        onClick={() => onNavigate('/citizen-dashboard')}
                        icon={LayoutDashboard}
                        isActive={location.pathname === '/citizen-dashboard'}
                      >
                        Citizen Dashboard
                      </NavItem>
                      <NavItem 
                        to="/report" 
                        onClick={() => onNavigate('/report')}
                        icon={AlertCircle}
                        isActive={location.pathname === '/report'}
                      >
                        Report Issue
                      </NavItem>
                    </>
                  )}
                  {official ? (
                    <NavItem 
                      to="/official-dashboard" 
                      onClick={() => onNavigate('/official-dashboard')}
                      icon={LayoutDashboard}
                      isActive={location.pathname === '/official-dashboard'}
                    >
                      Dashboard
                    </NavItem>
                  ) : (
                    <NavItem 
                      to="/track-complaints" 
                      onClick={() => onNavigate('/track-complaints')}
                      icon={LayoutDashboard}
                      isActive={location.pathname === '/track-complaints'}
                    >
                      Track
                    </NavItem>
                  )}
                  <NavItem 
                    to="/profile" 
                    onClick={() => {
                      onClose();
                      onNavigate('/profile');
                    }}
                    icon={UserIcon}
                    isActive={location.pathname === '/profile'}
                  >
                    Profile
                  </NavItem>
                  {official && (
                    <>
                      <NavItem
                        to="/official-priority"
                        onClick={() => onNavigate('/official-priority')}
                        icon={BarChart3}
                        isActive={location.pathname === '/official-priority'}
                      >
                        Priority
                      </NavItem>
                      <NavItem
                        to="/analytics"
                        onClick={() => onNavigate('/analytics')}
                        icon={BarChart3}
                        isActive={location.pathname === '/analytics'}
                      >
                        Analytics
                      </NavItem>
                    </>
                  )}
                  <div className="border-t border-gray-200 my-2"></div>
                  <NavItem 
                    onClick={() => {
                      onClose();
                      handleLogout();
                    }}
                    icon={LogOut}
                    className="text-red-600 hover:bg-red-50"
                  >
                    Sign Out
                  </NavItem>
                </>
              ) : (
                <>
                  <NavItem 
                    to="/" 
                    onClick={() => onNavigate('/')}
                    isActive={location.pathname === '/'}
                    className="justify-start"
                  >
                    Home
                  </NavItem>
                  <NavItem 
                    to="/citizen-login" 
                    onClick={() => onNavigate('/citizen-login')}
                    variant="outline"
                    isActive={location.pathname === '/citizen-login'}
                  >
                    Citizen Login
                  </NavItem>
                  <NavItem 
                    to="/official-login" 
                    onClick={() => onNavigate('/official-login')}
                    variant="outline"
                    isActive={location.pathname === '/official-login'}
                  >
                    Official Login
                  </NavItem>
                  <NavItem 
                    to="/register" 
                    onClick={() => onNavigate('/register')}
                    variant="primary"
                    isActive={location.pathname === '/register'}
                    className="justify-center"
                  >
                    Sign Up Free
                  </NavItem>
                </>
              )}
            </nav>
            {children ? (
              <div className="mt-4">
                {children}
              </div>
            ) : null}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, isOfficial, loading } = useAuth();
  const [userType, setUserType] = useState('citizen');
  const [lang, setLang] = useState('en');
  
  // Set user type based on authentication status and role
  useEffect(() => {
    if (currentUser) {
      setUserType(isOfficial ? 'official' : 'citizen');
    } else {
      setUserType('guest');
    }
  }, [currentUser, isOfficial]);

  // Initialize language selection from cookie/storage
  useEffect(() => {
    const stored = localStorage.getItem('preferred_lang');
    const current = stored || getCurrentTranslateLang();
    setLang(current);
  }, []);
  
  const handleLanguageChange = (value) => {
    setLang(value);
    setTranslateLang(value);
  };
  
  // Handle window resize for mobile/desktop detection
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setMobile(mobile);
      if (!mobile) {
        setIsMenuOpen(false); // Close mobile menu when resizing to desktop
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  if (loading) {
    return (
      <div className="h-16 bg-white border-b border-gray-200">
        <div className="h-full flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500"></div>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setIsMenuOpen(false);
      navigate('/');
      toast.success('Successfully signed out');
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Error signing out. Please try again.');
    }
  };
  
  const handleNavigation = (path) => {
    if (path === '/official-dashboard' && !isOfficial) {
      navigate('/unauthorized');
      return;
    }
    // Handle navigation
    navigate(path);
    setIsMenuOpen(false);
    window.scrollTo(0, 0);
  };

  return (
    <nav className="bg-white border-b border-gray-200 fixed w-full z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Brand onClick={() => {
              setIsMenuOpen(false);
              handleNavigation('/');
            }} />
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            {currentUser ? (
              <>
                {!isOfficial && (
                  <>
                    <NavItem 
                      to="/feed" 
                      icon={HomeIcon} 
                      isActive={location.pathname === '/feed'}
                      onClick={() => handleNavigation('/feed')}
                    >
                      Home
                    </NavItem>
                    <NavItem 
                      to="/citizen-dashboard" 
                      icon={LayoutDashboard} 
                      isActive={location.pathname === '/citizen-dashboard'}
                      onClick={() => handleNavigation('/citizen-dashboard')}
                    >
                      Citizen Dashboard
                    </NavItem>
                    <NavItem 
                      to="/report" 
                      icon={AlertCircle} 
                      isActive={location.pathname === '/report'}
                      onClick={() => handleNavigation('/report')}
                    >
                      Report Issue
                    </NavItem>
                  </>
                )}
                {isOfficial ? (
                  <NavItem 
                    to="/official-dashboard" 
                    icon={LayoutDashboard} 
                    isActive={location.pathname === '/official-dashboard'}
                    onClick={() => handleNavigation('/official-dashboard')}
                  >
                    Dashboard
                  </NavItem>
                ) : (
                  <NavItem 
                    to="/track-complaints" 
                    icon={LayoutDashboard} 
                    isActive={location.pathname === '/track-complaints'}
                    onClick={() => handleNavigation('/track-complaints')}
                  >
                    Track
                  </NavItem>
                )}
                {isOfficial && (
                  <>
                    <NavItem 
                      to="/official-priority" 
                      icon={BarChart3}
                      isActive={location.pathname === '/official-priority'}
                      onClick={() => handleNavigation('/official-priority')}
                    >
                      Priority
                    </NavItem>
                    <NavItem 
                      to="/analytics" 
                      icon={BarChart3}
                      isActive={location.pathname === '/analytics'}
                      onClick={() => handleNavigation('/analytics')}
                    >
                      Analytics
                    </NavItem>
                  </>
                )}
                <NavItem 
                  to="/profile" 
                  icon={UserIcon} 
                  isActive={location.pathname === '/profile'}
                  onClick={() => handleNavigation('/profile')}
                >
                  Profile
                </NavItem>
                <NavItem 
                  onClick={handleLogout}
                  icon={LogOut}
                  className="text-red-600 hover:bg-red-50"
                >
                  Sign Out
                </NavItem>
                {/* Language selector (desktop, compact) */}
                <div className="ml-1">
                  <select
                    aria-label="Select language"
                    className="border border-gray-300 rounded-md px-1 py-[2px] text-xs max-w-[9rem] truncate"
                    value={lang}
                    onChange={(e) => { const v = e.target.value; setLang(v); setTranslateLang(v); }}
                  >
                    {LANGS.map(l => (
                      <option key={l.code} value={l.code}>{(l.label || '').split(' (')[0]}</option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <NavItem 
                  to="/" 
                  isActive={location.pathname === '/'}
                  onClick={() => handleNavigation('/')}
                >
                  Home
                </NavItem>
                <NavItem 
                  to="/citizen-login" 
                  variant="outline"
                  isActive={location.pathname === '/citizen-login'}
                  onClick={() => handleNavigation('/citizen-login')}
                >
                  Citizen Login
                </NavItem>
                <NavItem 
                  to="/official-login" 
                  variant="outline"
                  isActive={location.pathname === '/official-login'}
                  onClick={() => handleNavigation('/official-login')}
                >
                  Official Login
                </NavItem>
                <NavItem 
                  to="/register" 
                  variant="primary"
                  isActive={location.pathname === '/register'}
                  onClick={() => handleNavigation('/register')}
                >
                  Sign Up Free
                </NavItem>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 focus:outline-none"
              aria-expanded="false"
            >
              <span className="sr-only">Open main menu</span>
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <MobileMenu 
        isOpen={isMenuOpen} 
        onClose={() => setIsMenuOpen(false)}
        user={currentUser}
        official={isOfficial}
        handleLogout={handleLogout}
        location={location}
        onNavigate={handleNavigation}
      >
        {/* Language selector (mobile, custom to avoid native picker) */}
        <div className="py-2">
          <MobileSelect
            value={lang}
            onChange={(val) => handleLanguageChange(val)}
            placeholder="Select language"
            className="border-gray-300"
            options={LANGS.map(l => ({ value: l.code, label: l.label }))}
          />
        </div>
      </MobileMenu>
    </nav>
  );
};

export default Navbar;
