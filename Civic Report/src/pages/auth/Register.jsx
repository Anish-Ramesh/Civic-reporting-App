import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, db } from '../../utils/Firebase';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { isOfficial, checkAadharExists } from '../../utils/FirebaseFunctions';
import { verhoeffCheck } from '../../lib/aadharValidation';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function Register() {
  const [activeTab, setActiveTab] = useState('citizen');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [departments, setDepartments] = useState([
    'Sanitation & Health',
    'Water & Sewerage',
    'Roads & Transport',
    'Street Lighting',
    'Parks & Horticulture',
    'Town Planning',
    'Revenue',
    'Education',
    'Public Works (PWD local)',
    'Fire Services'
  ]);
  const navigate = useNavigate();

  // Citizen form state
  const [citizenForm, setCitizenForm] = useState({
    name: '',
    gender: 'male',
    age: '',
    email: '',
    password: '',
    confirmPassword: '',
    aadhar: ''
  });

  // Official form state
  const [officialForm, setOfficialForm] = useState({
    name: '',
    gender: 'male',
    age: '',
    email: '',
    password: '',
    confirmPassword: '',
    aadhar: '',
    govtId: '',
    department: 'Sanitation & Health'
  });

  // Use the checkAadharExists function from FirebaseFunctions

  const handleCitizenChange = (e) => {
    const { name, value } = e.target;
    setCitizenForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleOfficialChange = (e) => {
    const { name, value } = e.target;
    setOfficialForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = (formData, isOfficial = false) => {
    // Basic validation
    if (!formData.name.trim()) {
      return 'Name is required';
    }
    if (!formData.email.includes('@')) {
      return 'Valid email is required';
    }
    if (formData.password.length < 6) {
      return 'Password must be at least 6 characters';
    }
    if (formData.password !== formData.confirmPassword) {
      return 'Passwords do not match';
    }
    if (!verhoeffCheck(formData.aadhar)) {
      return 'Invalid Aadhar number';
    }
    if (isOfficial && !formData.govtId) {
      return 'Government ID is required';
    }
    return '';
  };

  const handleCitizenSubmit = async (e) => {
    e.preventDefault();
    const errorMsg = validateForm(citizenForm);
    if (errorMsg) {
      toast.error(errorMsg);
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Check if Aadhar is already registered
      const aadharExists = await checkAadharExists(citizenForm.aadhar);
      if (aadharExists) {
        toast.error('This Aadhar number is already registered');
        setIsSubmitting(false);
        return;
      }
      
      await handleRegistration(citizenForm, 'citizen');
      toast.success('Registration successful! Welcome to Civic Mitra');
    } catch (error) {
      console.error('Registration error:', error);
      toast.error(error.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOfficialSubmit = async (e) => {
    e.preventDefault();
    const errorMsg = validateForm(officialForm, true);
    if (errorMsg) {
      toast.error(errorMsg);
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Check if Aadhar is already registered
      const aadharExists = await checkAadharExists(officialForm.aadhar);
      if (aadharExists) {
        toast.error('This Aadhar number is already registered');
        setIsSubmitting(false);
        return;
      }
      
      await handleRegistration(officialForm, 'official');
      toast.success('Registration submitted for review. You will be notified once approved.');
    } catch (error) {
      console.error('Registration error:', error);
      toast.error(error.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegistration = async (formData, userType) => {
    try {
      // Create user with email and password
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );
      
      const user = userCredential.user;
      
      // Update user profile with display name
      await updateProfile(user, {
        displayName: formData.name.trim()
      });
      
      // Prepare user data for Firestore
      const userData = {
        uid: user.uid,
        name: formData.name.trim(),
        email: formData.email.toLowerCase().trim(),
        userType,
        gender: formData.gender,
        age: parseInt(formData.age, 10),
        aadhar: formData.aadhar.replace(/\s/g, ''), // Remove spaces from Aadhar
        createdAt: new Date().toISOString(),
        phoneNumber: '', // Will be updated later
        address: '',    // Will be updated later
        profilePhoto: '',
        ...(userType === 'official' && {
          govtId: formData.govtId.trim(),
          department: formData.department,
          isVerified: false, // Admin needs to verify officials
          assignedComplaints: []
        })
      };
      
      // Save additional user data to Firestore
      await setDoc(doc(db, 'users', user.uid), userData);
      
      // Redirect based on user type
      navigate(userType === 'official' ? '/official-dashboard' : '/citizen-dashboard');
      
    } catch (error) {
      console.error('Registration error:', error);
      throw error; // Re-throw to be caught by the calling function
    }
  };

  // Add toast container
  useEffect(() => {
    // Cleanup function to clear any pending toasts when component unmounts
    return () => toast.dismiss();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-w-2xl">
        <div className="p-6 sm:p-8">
          <div className="flex justify-center mb-8">
            <h2 className="text-3xl font-extrabold text-gray-900">
              Create an account
            </h2>
          </div>
          
          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => setActiveTab('citizen')}
              className={`py-2 px-4 font-medium text-sm focus:outline-none flex-1 text-center ${
                activeTab === 'citizen'
                  ? 'border-b-2 border-emerald-500 text-emerald-600 font-semibold'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Citizen Account
            </button>
            <button
              onClick={() => setActiveTab('official')}
              className={`py-2 px-4 font-medium text-sm focus:outline-none flex-1 text-center ${
                activeTab === 'official'
                  ? 'border-b-2 border-emerald-500 text-emerald-600 font-semibold'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Government Official
            </button>
          </div>
          
          {/* Error messages are now handled by toast notifications */}
          
          {/* Citizen Form */}
          {activeTab === 'citizen' && (
            <form className="space-y-6" onSubmit={handleCitizenSubmit}>
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Full Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={citizenForm.name}
                  onChange={handleCitizenChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="gender" className="block text-sm font-medium text-gray-700">
                    Gender
                  </label>
                  <select
                    id="gender"
                    name="gender"
                    value={citizenForm.gender}
                    onChange={handleCitizenChange}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm rounded-md"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                </div>
                
                <div>
                  <label htmlFor="age" className="block text-sm font-medium text-gray-700">
                    Age
                  </label>
                  <input
                    id="age"
                    name="age"
                    type="number"
                    min="1"
                    max="120"
                    required
                    value={citizenForm.age}
                    onChange={handleCitizenChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>
              
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={citizenForm.email}
                  onChange={handleCitizenChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              
              <div>
                <label htmlFor="aadhar" className="block text-sm font-medium text-gray-700">
                  Aadhar Number
                </label>
                <input
                  id="aadhar"
                  name="aadhar"
                  type="text"
                  inputMode="numeric"
                  placeholder="123456789012"
                  value={citizenForm.aadhar}
                  onChange={(e) => {
                    // Allow only numbers and limit to 12 digits
                    const value = e.target.value.replace(/\D/g, '').slice(0, 12);
                    setCitizenForm(prev => ({
                      ...prev,
                      aadhar: value
                    }));
                  }}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                />
                <p className="mt-1 text-xs text-gray-500">Enter 12-digit Aadhar number</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength="6"
                    value={citizenForm.password}
                    onChange={handleCitizenChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={citizenForm.confirmPassword}
                    onChange={handleCitizenChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>
              
              <div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Creating Account...
                    </>
                  ) : 'Create Citizen Account'}
                </button>
              </div>
            </form>
          )}
          
          {/* Official Form */}
          {activeTab === 'official' && (
            <form className="space-y-6" onSubmit={handleOfficialSubmit}>
              <div>
                <label htmlFor="official-name" className="block text-sm font-medium text-gray-700">
                  Full Name
                </label>
                <input
                  id="official-name"
                  name="name"
                  type="text"
                  required
                  value={officialForm.name}
                  onChange={handleOfficialChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="official-gender" className="block text-sm font-medium text-gray-700">
                    Gender
                  </label>
                  <select
                    id="official-gender"
                    name="gender"
                    value={officialForm.gender}
                    onChange={handleOfficialChange}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm rounded-md"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                </div>
                
                <div>
                  <label htmlFor="official-age" className="block text-sm font-medium text-gray-700">
                    Age
                  </label>
                  <input
                    id="official-age"
                    name="age"
                    type="number"
                    min="18"
                    max="100"
                    required
                    value={officialForm.age}
                    onChange={handleOfficialChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>
              
              <div>
                <label htmlFor="official-email" className="block text-sm font-medium text-gray-700">
                  Official Email
                </label>
                <input
                  id="official-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={officialForm.email}
                  onChange={handleOfficialChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              
              <div>
                <label htmlFor="official-aadhar" className="block text-sm font-medium text-gray-700">
                  Aadhar Number
                </label>
                <input
                  id="official-aadhar"
                  name="aadhar"
                  type="text"
                  inputMode="numeric"
                  placeholder="123456789012"
                  value={officialForm.aadhar}
                  onChange={(e) => {
                    // Allow only numbers and limit to 12 digits
                    const value = e.target.value.replace(/\D/g, '').slice(0, 12);
                    setOfficialForm(prev => ({
                      ...prev,
                      aadhar: value
                    }));
                  }}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                />
                <p className="mt-1 text-xs text-gray-500">Enter 12-digit Aadhar number</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="govtId" className="block text-sm font-medium text-gray-700">
                    Government ID
                  </label>
                  <input
                    id="govtId"
                    name="govtId"
                    type="text"
                    required
                    value={officialForm.govtId}
                    onChange={handleOfficialChange}
                    placeholder="e.g., EMP12345"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">Your official government employee ID</p>
                </div>
                
                <div>
                  <label htmlFor="department" className="block text-sm font-medium text-gray-700">
                    Department
                  </label>
                  <select
                    id="department"
                    name="department"
                    value={officialForm.department}
                    onChange={handleOfficialChange}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm rounded-md"
                  >
                    {departments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="official-password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <input
                    id="official-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength="6"
                    value={officialForm.password}
                    onChange={handleOfficialChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                
                <div>
                  <label htmlFor="official-confirmPassword" className="block text-sm font-medium text-gray-700">
                    Confirm Password
                  </label>
                  <input
                    id="official-confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={officialForm.confirmPassword}
                    onChange={handleOfficialChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>
              
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700">
                      Your account will be reviewed by an administrator before you can access the system.
                      You will receive an email once your account is approved.
                    </p>
                  </div>
                </div>
              </div>
              
              <div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Submitting...
                    </>
                  ) : 'Register as Official'}
                </button>
              </div>
            </form>
          )}
          
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link 
                to={activeTab === 'citizen' ? '/citizen-login' : '/official-login'} 
                className="font-medium text-emerald-600 hover:text-emerald-500 hover:underline"
              >
                Sign in as {activeTab === 'citizen' ? 'Citizen' : 'Official'}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
