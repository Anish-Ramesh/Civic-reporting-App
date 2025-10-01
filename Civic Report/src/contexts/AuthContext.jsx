import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { auth } from '../utils/Firebase';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { isOfficial } from '../utils/FirebaseFunctions';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isOfficialUser, setIsOfficialUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Handle user sign out
  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
      // Don't update state here - the auth state listener will handle it
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }, []);

  // Check if the current user is an official
  const checkUserRole = useCallback(async (user) => {
    if (!user) {
      setIsOfficialUser(false);
      return false;
    }

    try {
      const officialStatus = await isOfficial(user.uid);
      console.log('[AuthContext] User role check:', {
        uid: user.uid,
        isOfficial: officialStatus
      });
      setIsOfficialUser(officialStatus);
      return officialStatus;
    } catch (error) {
      console.error('[AuthContext] Error checking user role:', error);
      setIsOfficialUser(false);
      return false;
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    let isMounted = true;
    
    const handleAuthStateChanged = async (user) => {
      if (!isMounted) return;
      
      console.log('[AuthContext] Auth state changed:', { 
        uid: user?.uid,
        email: user?.email
      });
      
      // Update current user state
      setCurrentUser(user);
      
      if (user) {
        // Check user role if we have a user
        await checkUserRole(user);
      } else {
        setIsOfficialUser(false);
      }
      
      if (isMounted) {
        setLoading(false);
        setInitialized(true);
      }
    };
    
    // Set up the auth state listener
    const unsubscribe = onAuthStateChanged(auth, handleAuthStateChanged);
    
    // Cleanup function
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [checkUserRole]);
  
  // Provide auth context to children
  const value = {
    currentUser,
    isOfficial: isOfficialUser,
    loading,
    initialized,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {!initialized ? (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
