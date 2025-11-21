import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

const AuthNavbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  
  const navItems = [
    { name: 'Home', path: '/' },
    { name: 'Register', path: '/register' },
  ];

  const isActive = (path) => {
    return location.pathname === path ? 'text-emerald-600' : 'text-gray-700';
  };

  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center">
            <Link 
              to="/" 
              className="flex items-center gap-2 group transition-all duration-200"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
                <svg 
                  className="w-5 h-5 text-white" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path 
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" 
                    fill="currentColor"
                  />
                  <path 
                    d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" 
                    fill="currentColor"
                  />
                </svg>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-800 bg-clip-text text-transparent">
                Civic Mitra
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden sm:ml-6 sm:flex sm:items-center sm:space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                className={`${isActive(item.path)} hover:text-emerald-500 px-3 py-2 text-sm font-medium transition-colors duration-200`}
              >
                {item.name}
              </Link>
            ))}
            <div className="relative group">
              <button 
                className="flex items-center text-gray-700 hover:text-emerald-600 px-3 py-2 text-sm font-medium transition-colors duration-200 whitespace-nowrap"
                onMouseEnter={(e) => e.currentTarget.parentElement.classList.add('hover-active')}
                onMouseLeave={(e) => e.currentTarget.parentElement.classList.remove('hover-active')}
              >
                <span>Login</span>
                <svg 
                  className="ml-1 h-4 w-4 flex-shrink-0 transition-transform duration-200 group-hover:rotate-180" 
                  fill="currentColor" 
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path 
                    fillRule="evenodd" 
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" 
                    clipRule="evenodd" 
                  />
                </svg>
              </button>
              <div className="absolute left-0 mt-2 w-48 rounded-lg shadow-lg bg-white ring-1 ring-black ring-opacity-5 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-[.hover-active]:opacity-100 group-[.hover-active]:visible transition-all duration-200 transform -translate-x-1/2 z-50" style={{ top: '100%', left: '50%' }} onMouseEnter={(e) => e.stopPropagation()}>
                <div className="py-1">
                  <Link
                    to="/citizen-login"
                    className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150"
                  >
                    Citizen Login
                  </Link>
                  <Link
                    to="/official-login"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Official Login
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <div className="-mr-2 flex items-center sm:hidden">
            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500"
              aria-expanded="false"
            >
              <span className="sr-only">Open main menu</span>
              {isMenuOpen ? (
                <X className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={`${isMenuOpen ? 'block' : 'hidden'} sm:hidden`}>
        <div className="pt-2 pb-3 space-y-1 bg-white">
          {navItems.map((item) => (
            <Link
              key={`mobile-${item.name}`}
              to={item.path}
              onClick={() => setIsMenuOpen(false)}
              className={`${isActive(item.path) ? 'bg-emerald-50 text-emerald-600' : 'text-gray-700 hover:bg-gray-50'} block px-4 py-3 text-base font-medium border-b border-gray-100`}
            >
              {item.name}
            </Link>
          ))}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Login As</p>
            <Link
              to="/citizen-login"
              onClick={() => setIsMenuOpen(false)}
              className="block py-2 pl-4 pr-2 text-base font-medium text-gray-700 hover:text-emerald-600 hover:bg-gray-50 rounded-md transition-colors duration-150"
            >
              Citizen
            </Link>
            <Link
              to="/official-login"
              onClick={() => setIsMenuOpen(false)}
              className="block py-2 pl-4 pr-2 text-base font-medium text-gray-700 hover:text-emerald-600 hover:bg-gray-50 rounded-md transition-colors duration-150"
            >
              Official
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default AuthNavbar;
