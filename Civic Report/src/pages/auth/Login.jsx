import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
// Firebase imports
import { 
  signInWithEmailAndPassword, 
  setPersistence, 
  browserLocalPersistence 
} from 'firebase/auth';
// Use unified Firebase utils to ensure consistent auth instance
import { auth } from '../../utils/Firebase';
import { isOfficial } from '../../utils/FirebaseFunctions';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function Login() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const [sessionUser, setSessionUser] = useState(null);
  
  // Determine if this is for officials or citizens based on the route
  const isOfficialLogin = location.pathname === '/official-login';
  const userType = isOfficialLogin ? 'official' : 'citizen';

  useEffect(() => {
    // Track session for sign-out option; do not auto-navigate to avoid loops
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setSessionUser(user || null);
    });
    return () => unsubscribe();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    setError('');
    setIsSubmitting(true);
    
    try {
      const { email, password } = formData;
      console.groupCollapsed('[Login] Attempting login');
      console.log('Email:', email);
      console.log('Is Official Login:', isOfficialLogin);
      
      // Set auth state persistence first
      console.log('[Login] Setting auth persistence...');
      await setPersistence(auth, browserLocalPersistence);
      console.log('[Login] Auth persistence set to LOCAL');
      
      // First, sign out any existing session to prevent conflicts
      try {
        console.log('[Login] Signing out any existing session...');
        await auth.signOut();
        console.log('[Login] Successfully signed out any existing session');
      } catch (signOutError) {
        console.log('[Login] No existing session to sign out of');
      }
      
      // Sign in with Firebase Auth
      console.log('[Login] Signing in with email/password...');
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log('[Login] Firebase Auth successful, checking user role...');

      // Check if user is official using the same function as AuthContext
      console.log('[Login] Checking user role...');
      const userIsOfficial = await isOfficial(user.uid);
      console.log('[Login] User role check complete:', { 
        uid: user.uid, 
        isOfficial: userIsOfficial, 
        expectedOfficial: isOfficialLogin 
      });

      // Verify the user is using the correct login page for their role
      if ((isOfficialLogin && !userIsOfficial) || (!isOfficialLogin && userIsOfficial)) {
        console.log('[Login] Role mismatch detected, signing out...');
        await auth.signOut();
        const errorMsg = isOfficialLogin 
          ? 'This account is not authorized for official access. Please use the citizen login.'
          : 'This is an official account. Please use the official login page.';
        console.log('[Login] Error:', errorMsg);
        setError(errorMsg);
        toast.error(errorMsg);
        setIsSubmitting(false);
        console.groupEnd();
        return;
      }

      // Force refresh the token to ensure latest claims
      console.log('[Login] Refreshing ID token...');
      await user.getIdToken(true);
      
      // Determine the correct redirect path based on user role
      const redirectPath = userIsOfficial ? '/official-dashboard' : '/feed';
      console.log('[Login] Login successful, redirecting to:', redirectPath);
      console.groupEnd();
      
      // Use a full page reload to ensure all auth state is properly initialized
      window.location.href = redirectPath;
    } catch (error) {
      console.error('Login error:', error);
      let errorMessage = 'Login failed. Please check your credentials and try again.';
      
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        errorMessage = 'Invalid email or password.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = 'This account has been disabled. Please contact support.';
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          {isOfficialLogin ? 'Official Login' : 'Citizen Login'}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Or{' '}
          <Link 
            to={isOfficialLogin ? '/register' : '/register'}
            className="font-medium text-emerald-600 hover:text-emerald-500"
          >
            create a new account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {sessionUser && (
            <div className="mb-4 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-center justify-between">
              <span>You are currently signed in. If you expected to be logged out, please sign out below.</span>
              <button
                type="button"
                onClick={async () => { try { await auth.signOut(); toast.info('Signed out'); } catch (e) {} }}
                className="ml-3 inline-flex items-center px-2.5 py-1.5 border border-amber-300 rounded-md text-xs font-medium bg-white hover:bg-amber-100"
              >
                Sign Out
              </button>
            </div>
          )}
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">{error}</h3>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <Link to="/forgot-password" className="font-medium text-emerald-600 hover:text-emerald-500">
                  Forgot your password?
                </Link>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing in...
                  </>
                ) : (
                  `Sign in as ${userType}`
                )}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div>
                <a
                  href="#"
                  className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                >
                  <span className="sr-only">Sign in with Google</span>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
                  </svg>
                </a>
              </div>

              <div>
                <a
                  href="#"
                  className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                >
                  <span className="sr-only">Sign in with Aadhaar</span>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
          
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              {isOfficialLogin ? 'Are you a citizen? ' : 'Are you a government official? '}
              <Link 
                to={isOfficialLogin ? '/citizen-login' : '/official-login'} 
                className="font-medium text-emerald-600 hover:text-emerald-500"
              >
                {isOfficialLogin ? 'Citizen Login' : 'Official Login'}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
