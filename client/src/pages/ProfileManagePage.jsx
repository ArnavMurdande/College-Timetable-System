// File: client/src/pages/ProfileManagePage.jsx

import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../App'; // Import the useAuth hook

const API_BASE_URL = 'http://localhost:5001/api';

function ProfileManagePage() {
  // Get user info from context
  const { userInfo, handleLogout } = useAuth(); // Use context

  // State for form fields and messages
  const [currentEmail, setCurrentEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success', 'error', 'info'
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  const [isLoadingPassword, setIsLoadingPassword] = useState(false);

  const navigate = useNavigate();

  // --- Effect to pre-fill email form when userInfo loads ---
  useEffect(() => {
    if (userInfo) {
      setCurrentEmail(userInfo.email || '');
      setNewEmail(userInfo.email || ''); // Pre-fill the form field
    } else {
        // If userInfo is somehow null after initial check, redirect to login
        console.warn("ProfileManagePage: userInfo is null, redirecting.");
        // handleLogout(); // Optional: clear any potentially bad state
        // navigate('/login-signup');
    }
  }, [userInfo]); // Re-run if userInfo changes

  // --- Handle Email Update ---
  const handleEmailUpdate = async (e) => {
    e.preventDefault();
    setMessage(''); setMessageType('');
    const authToken = localStorage.getItem('authToken'); // Still get token directly

    if (!userInfo?.id || !authToken) {
        setMessage('Authentication error. Please log in again.'); setMessageType('error'); return;
    }
    if (newEmail === currentEmail) {
        setMessage('New email is the same as the current email.'); setMessageType('info'); return;
    }

    setIsLoadingEmail(true);
    try {
      const response = await axios.put(
        `${API_BASE_URL}/auth/update-email`,
        { newEmail: newEmail }, // Backend gets userId from token via 'protect' middleware
        { headers: { 'Authorization': `Bearer ${authToken}` } }
      );
      setMessage('Email updated successfully!'); setMessageType('success');
      const updatedUser = response.data.user;
      setCurrentEmail(updatedUser.email); setNewEmail(updatedUser.email);
      // **IMPORTANT:** Need to update context/localStorage - handleLoginSuccess in App can do this
      // For now, just update local state. A full context update is better.
      localStorage.setItem('userInfo', JSON.stringify(updatedUser)); // Update local storage directly for now

    } catch (err) {
      console.error("Update Email Error:", err);
      setMessage(err.response?.data?.message || 'Failed to update email.'); setMessageType('error');
      setNewEmail(currentEmail); // Reset form field on error
    } finally {
      setIsLoadingEmail(false);
    }
  };

  // --- Handle Password Change ---
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setMessage(''); setMessageType('');

    if (newPassword !== confirmNewPassword) { setMessage('New passwords do not match.'); setMessageType('error'); return; }
    if (!currentPassword || !newPassword) { setMessage('All password fields are required.'); setMessageType('error'); return; }
    if (newPassword.length < 6) { setMessage('New password must be at least 6 characters.'); setMessageType('error'); return; }


    const authToken = localStorage.getItem('authToken');
     if (!userInfo?.id || !authToken) { setMessage('Authentication error. Please log in again.'); setMessageType('error'); return; }

    setIsLoadingPassword(true);
    try {
       await axios.put(
        `${API_BASE_URL}/auth/update-password`,
        { currentPassword, newPassword, confirmNewPassword }, // Backend gets userId from token
        { headers: { 'Authorization': `Bearer ${authToken}` } }
      );
      setMessage('Password changed successfully!'); setMessageType('success');
      setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword(''); // Clear fields
    } catch (err) {
      console.error("Update Password Error:", err);
      setMessage(err.response?.data?.message || 'Failed to change password.'); setMessageType('error');
    } finally {
      setIsLoadingPassword(false);
    }
  };

  // Render loading state if user info isn't available yet
  if (!userInfo) {
      return <div className="text-center p-8">Loading profile...</div>; // Or redirect if authChecked is done and still no user
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-theme(space.20)-theme(space.16))] bg-gray-100 dark:bg-gray-900 px-4 py-8">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 shadow-xl rounded-lg p-8">
        <h1 className="text-3xl font-bold mb-6 text-center text-gray-800 dark:text-white">
          Manage Profile
        </h1>

        {/* Message Display */}
        {message && (
          <div className={`px-4 py-3 rounded relative mb-6 text-sm ${ messageType === 'success' ? 'bg-green-100 border border-green-400 text-green-700 dark:bg-green-900 dark:text-green-200 dark:border-green-700' : messageType === 'error' ? 'bg-red-100 border border-red-400 text-red-700 dark:bg-red-900 dark:text-red-200 dark:border-red-700' : 'bg-blue-100 border border-blue-400 text-blue-700 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700' }`} role="alert">
             <button onClick={() => setMessage('')} className="absolute top-0 bottom-0 right-0 px-4 py-3 font-bold">&times;</button>
            <span className="block sm:inline">{message}</span>
          </div>
        )}

        {/* Email Update Section */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Update Email</h2>
          <form onSubmit={handleEmailUpdate}>
            <div className="mb-4">
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="email-update">
                Email Address <span className="text-xs font-normal">(Current: {currentEmail})</span>
              </label>
              <input className="shadow-sm appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 dark:bg-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-70" id="email-update" type="email" placeholder="Enter new email address" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required disabled={isLoadingEmail} />
            </div>
            <button className={`w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors duration-200 ${isLoadingEmail ? 'opacity-50 cursor-not-allowed' : ''}`} type="submit" disabled={isLoadingEmail}>
              {isLoadingEmail ? 'Updating...' : 'Update Email'}
            </button>
          </form>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-600 my-8"></div>

        {/* Password Change Section */}
        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Change Password</h2>
          <form onSubmit={handlePasswordChange}>
             {/* Current Password */}
             <div className="mb-4">
               <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="current-password"> Current Password </label>
               <input className="shadow-sm appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 dark:bg-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-70" id="current-password" type="password" placeholder="Enter your current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required disabled={isLoadingPassword} />
             </div>
            {/* New Password */}
            <div className="mb-4">
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="new-password"> New Password </label>
              <input className="shadow-sm appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 dark:bg-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-70" id="new-password" type="password" placeholder="Enter new password (min 6 chars)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} disabled={isLoadingPassword} />
            </div>
            {/* Confirm New Password */}
            <div className="mb-6">
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="confirm-new-password"> Confirm New Password </label>
              <input className="shadow-sm appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 dark:bg-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-70" id="confirm-new-password" type="password" placeholder="Confirm new password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} required minLength={6} disabled={isLoadingPassword} />
            </div>
            <button className={`w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors duration-200 ${isLoadingPassword ? 'opacity-50 cursor-not-allowed' : ''}`} type="submit" disabled={isLoadingPassword}>
              {isLoadingPassword ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </div>

        {/* Back Link */}
        <div className="text-center mt-8">
           <NavLink to="/" className="inline-block text-blue-500 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-600 text-sm font-bold transition-colors">
             Back to Home
           </NavLink>
        </div>

      </div>
    </div>
  );
}

export default ProfileManagePage;

