import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';

// Debug logger
const debug = (message, data = {}) => {
  console.log(`[ProtectedRoute] ${message}`, data);
};

export default function ProtectedRoute({ children, requiredRole }) {
  const { currentUser, isOfficial, loading, initialized } = useAuth();
  const location = useLocation();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Log initial render
  useEffect(() => {
    debug('Component mounted', {
      path: location.pathname,
      requiredRole,
      currentUser: !!currentUser,
      isOfficial,
      loading,
      initialized
    });
  }, []);

  // Handle auth state changes
  useEffect(() => {
    debug('Auth state changed', {
      loading,
      initialized,
      currentUser: !!currentUser,
      isOfficial
    });

    // Only show loading state if we're still initializing or checking auth
    const timer = setTimeout(() => {
      const shouldCheck = loading || !initialized;
      debug('Updating isCheckingAuth', { shouldCheck, loading, initialized });
      setIsCheckingAuth(shouldCheck);
    }, 100);
    
    return () => {
      clearTimeout(timer);
    };
  }, [loading, initialized, currentUser, isOfficial]);

  // Show loading state
  if (isCheckingAuth) {
    debug('Showing loading state', { loading, initialized });
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }
  
  // If user is not logged in, redirect to appropriate login page
  if (!currentUser) {
    const isOfficialRoute = location.pathname.startsWith('/official');
    const loginPath = isOfficialRoute ? '/official-login' : '/citizen-login';
    
    debug('User not authenticated, redirecting to login', {
      isOfficialRoute,
      loginPath,
      from: location.pathname
    });
    
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }
  
  // Check if route requires specific role
  if (requiredRole === 'official' && !isOfficial) {
    debug('Route requires official access', {
      currentUser: currentUser.uid,
      isOfficial,
      requiredRole
    });
    
    return <Navigate to="/unauthorized" state={{ from: location }} replace />;
  }
  
  // Redirect to appropriate dashboard if trying to access login pages while logged in
  if ((location.pathname === '/citizen-login' || location.pathname === '/official-login') && currentUser) {
    const redirectPath = isOfficial ? '/official-dashboard' : '/feed';
    
    debug('Already logged in, redirecting to dashboard', {
      isOfficial,
      redirectPath
    });
    
    return <Navigate to={redirectPath} replace />;
  }
  
  console.log('[ProtectedRoute] Render', {
    currentUser: !!currentUser,
    isOfficial,
    requiredRole,
    pathname: location.pathname,
    search: location.search
  });

  // If already on the unauthorized page, don't redirect (prevents loops)
  if (location.pathname === '/unauthorized') {
    return children;
  }

  // Allow officials to access profile and other allowed citizen routes
  if (isOfficial && requiredRole !== 'official') {
    const allowedCitizenRoutes = [
      '/profile',
      '/track-complaints'
    ];
    
    const isOnOfficialPage = location.pathname.startsWith('/official-') || 
                           location.pathname === '/official-dashboard' ||
                           location.pathname === '/analytics' ||
                           allowedCitizenRoutes.includes(location.pathname);
    
    if (!isOnOfficialPage) {
      console.log('[ProtectedRoute] Official on citizen route, redirecting to dashboard', {
        currentPath: location.pathname,
        isOfficial,
        requiredRole
      });
      return <Navigate to="/official-dashboard" replace />;
    }
  }

  return children;
}
