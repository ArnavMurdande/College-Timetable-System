// File: client/src/pages/LoginSignupPage.jsx

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App'; // Import useAuth to access handleLoginSuccess

const API_BASE_URL = 'http://localhost:5001/api';

// Removed handleLoginSuccess from props, will get from useAuth()
function LoginSignupPage() {
  const { handleLoginSuccess } = useAuth(); // Get handleLoginSuccess from context

  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  // Determine where to redirect after successful login/signup
  const from = location.state?.from?.pathname || "/dashboard"; // Default to dashboard

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Basic client-side validation
    if (!email || !password) {
      setError('Email and password are required.');
      setIsLoading(false);
      return;
    }
    if (!isLoginMode && !confirmPassword) {
      setError('Please confirm your password for signup.');
      setIsLoading(false);
      return;
    }
    if (!isLoginMode && password !== confirmPassword) {
      setError('Passwords do not match.');
      setIsLoading(false);
      return;
    }
    if (password.length < 6) { // Consistent with backend validation
      setError('Password must be at least 6 characters long.');
      setIsLoading(false);
      return;
    }

    // Determine API endpoint and payload based on mode (Login or Signup)
    const url = isLoginMode ? `${API_BASE_URL}/auth/login` : `${API_BASE_URL}/auth/signup`;
    const payload = isLoginMode ? { email, password } : { email, password, confirmPassword };

    try {
      const response = await axios.post(url, payload);
      // Backend sends 200 for login, 201 for signup on success
      if (response.status === 200 || response.status === 201) {
        // Call handleLoginSuccess from context with user data, token, and expiry
        handleLoginSuccess(response.data.user, response.data.token, response.data.expiresIn);
        navigate(from, { replace: true }); // Redirect to previous page or dashboard
      } else {
         // This case should ideally not be hit if backend adheres to status codes
         setError(`An unexpected error occurred: Status ${response.status}`);
      }
    } catch (err) {
      console.error(`${isLoginMode ? 'Login' : 'Signup'} error:`, err);
      if (err.response?.data?.message) {
        setError(err.response.data.message); // Display error from backend
      } else if (err.request) {
        // Network error (server not reachable)
        setError('Could not connect to the server. Please try again later.');
      } else {
        // Other unexpected errors
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // Using min-h-[calc(100vh-theme(space.20)-theme(space.16))] to attempt to fill viewport height minus navbar/footer approx
    // A more robust solution might involve flex-grow on the main content area in App.jsx
    <div className="flex items-center justify-center min-h-[calc(100vh-80px-56px)] bg-gray-100 dark:bg-gray-900 px-4 py-8"> {/* Adjusted min-height */}
      <div className="w-full max-w-md bg-white dark:bg-gray-800 shadow-xl rounded-lg p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-center text-gray-800 dark:text-white">
          {isLoginMode ? 'Login' : 'Sign Up'}
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-6 text-sm">
            {isLoginMode
                ? 'Log in to access your dashboard and features.'
                : 'Sign up to create an account. New accounts require admin approval.'}
        </p>

        {/* Error Message Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/30 dark:text-red-300 px-4 py-3 rounded relative mb-4 text-sm" role="alert">
             <button 
                onClick={() => setError('')} 
                className="absolute top-0 bottom-0 right-0 px-4 py-3 text-red-700 dark:text-red-300 font-bold hover:text-red-900 dark:hover:text-red-100"
                aria-label="Close error message"
             >
                &times;
            </button>
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {/* Login/Signup Form */}
        <form onSubmit={handleSubmit}>
          {/* Email Input */}
          <div className="mb-4">
            <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="email">
              Email Address
            </label>
            <input
              className="shadow-sm appearance-none border rounded w-full py-2.5 px-3 text-gray-700 dark:text-gray-200 dark:bg-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-70"
              id="email" type="email" placeholder="your.email@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isLoading}
              autoComplete="email"
            />
          </div>
          {/* Password Input */}
          <div className="mb-6">
            <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="password">
              Password (min. 6 characters)
            </label>
            <input
              className="shadow-sm appearance-none border rounded w-full py-2.5 px-3 text-gray-700 dark:text-gray-200 dark:bg-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-70"
              id="password" type="password" placeholder="******************"
              value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} disabled={isLoading}
              autoComplete={isLoginMode ? "current-password" : "new-password"}
            />
          </div>
          {/* Confirm Password Input (Signup Mode Only) */}
          {!isLoginMode && (
            <div className="mb-6">
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="confirm-password">
                Confirm Password
              </label>
              <input
                className="shadow-sm appearance-none border rounded w-full py-2.5 px-3 text-gray-700 dark:text-gray-200 dark:bg-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-70"
                id="confirm-password" type="password" placeholder="******************"
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required={!isLoginMode} minLength={6} disabled={isLoading}
                autoComplete="new-password"
              />
            </div>
          )}
          {/* Submit Button & Mode Toggle */}
          <div className="flex flex-col items-center gap-4">
            <button
              className={`w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors duration-200 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              type="submit" disabled={isLoading}
            >
              {isLoading ? (isLoginMode ? 'Logging in...' : 'Signing up...') : (isLoginMode ? 'Sign In' : 'Create Account')}
            </button>
            <button
              type="button"
              className="w-full text-center font-medium text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors disabled:opacity-50"
              onClick={() => { 
                setIsLoginMode(!isLoginMode); 
                setError(''); // Clear errors when switching mode
                // Optionally clear form fields:
                // setEmail(''); 
                // setPassword(''); 
                // setConfirmPassword('');
              }}
              disabled={isLoading}
            >
              {isLoginMode ? 'Need an account? Sign Up' : 'Already have an account? Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LoginSignupPage;
