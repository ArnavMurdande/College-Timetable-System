// File: client/src/pages/AdminPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../App'; // Import useAuth hook

const API_BASE_URL = 'http://localhost:5001/api';
const ROLES = ['Admin', 'Faculty', 'User'];

function AdminPage() {
  const { userInfo } = useAuth(); // Get logged-in user info from context
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterPending, setFilterPending] = useState(false);
  const currentAdminId = userInfo?.id; // Get ID from context

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError('');
    const token = localStorage.getItem('authToken'); // Still get token directly for header

    if (!token) {
      setError('Authentication token not found. Please log in.');
      setIsLoading(false);
      return;
    }
    console.log("AdminPage: Fetching users with token:", token ? 'found' : 'missing'); // Debug log

    try {
      const url = `${API_BASE_URL}/admin/users${filterPending ? '?pending=true' : ''}`;
      const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${token}` } });
      setUsers(response.data);
    } catch (err) {
      console.error("Fetch Users Error:", err);
      setError(err.response?.data?.message || 'Failed to fetch users.');
    } finally {
      setIsLoading(false);
    }
  }, [filterPending]);

  useEffect(() => {
    // Fetch only if confirmed logged in as Admin
    if (userInfo?.role === 'Admin') {
        fetchUsers();
    } else {
        // This case should ideally be handled by ProtectedRoute, but as a fallback:
        setError("Access Denied: You must be an Admin.");
    }
  }, [fetchUsers, userInfo]); // Re-fetch if filter or userInfo changes

  const handleRoleChange = async (userId, userEmail, newRole) => {
    // ... (keep existing handleRoleChange logic, ensure token is read from localStorage) ...
    setError('');
    const token = localStorage.getItem('authToken');
    if (!token) { setError('Authentication token not found.'); return; }
    if (!window.confirm(`Change user ${userEmail} (ID ${userId}) role to ${newRole}?`)) return;

    try {
      await axios.put( `${API_BASE_URL}/admin/users/${userId}/role`, { role: newRole }, { headers: { 'Authorization': `Bearer ${token}` } } );
      alert('User role updated successfully!');
      fetchUsers();
    } catch (err) {
      console.error("Update Role Error:", err);
      setError(err.response?.data?.message || 'Failed to update user role.');
    }
  };

  const handleDeleteUser = async (userId, userEmail) => {
    // ... (keep existing handleDeleteUser logic, ensure token is read from localStorage) ...
     setError('');
     const token = localStorage.getItem('authToken');
     if (!token) { setError('Authentication token not found.'); return; }
     if (userId === currentAdminId) { setError('You cannot delete your own account.'); return; }
     if (!window.confirm(`ARE YOU SURE you want to permanently delete user ${userEmail} (ID ${userId})?`)) return;

     try {
         await axios.delete(`${API_BASE_URL}/admin/users/${userId}`, { headers: { 'Authorization': `Bearer ${token}` } });
         alert('User deleted successfully!');
         fetchUsers();
     } catch (err) {
         console.error("Delete User Error:", err);
         setError(err.response?.data?.message || 'Failed to delete user.');
     }
  };

  // Main component render... (keep existing JSX structure)
  // Use currentAdminId from state for disabling buttons
  return (
    <div className="container mx-auto p-4 md:p-8">
      <h1 className="text-3xl md:text-4xl font-bold mb-6 text-gray-800 dark:text-white">Admin - User Management</h1>

      {/* Error Display */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4 text-sm" role="alert">
           <button onClick={() => setError('')} className="absolute top-0 bottom-0 right-0 px-4 py-3 text-red-700 font-bold">&times;</button>
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      {/* Filter Controls */}
      <div className="mb-4 flex items-center space-x-4">
          <label className="flex items-center text-gray-700 dark:text-gray-300">
              <input type="checkbox" className="mr-2 form-checkbox h-5 w-5 text-blue-600 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500" checked={filterPending} onChange={(e) => setFilterPending(e.target.checked)} />
              Show Only Pending Users
          </label>
          <button onClick={fetchUsers} disabled={isLoading} className="px-4 py-1 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded disabled:opacity-50">
              Refresh List
          </button>
      </div>

      {/* Loading Indicator */}
      {isLoading && <p className="text-center text-gray-600 dark:text-gray-400 py-10">Loading users...</p>}

      {/* User Table */}
      {!isLoading && users.length === 0 && (
        <p className="text-center text-gray-600 dark:text-gray-400 py-10">No users found matching the criteria.</p>
      )}

      {!isLoading && users.length > 0 && (
        <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow-md rounded-lg border dark:border-gray-600">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
               {/* Table Headers */}
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">ID</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Email</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Role</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Pending</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  {/* Table Data Cells */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{user.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{user.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{user.role}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${ user.isPending ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' }`}>
                      {user.isPending ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2 flex items-center">
                    {/* Role Change Dropdown */}
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, user.email, e.target.value)}
                      className="block w-auto pl-3 pr-10 py-1 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                      disabled={user.id === currentAdminId}
                      title={user.id === currentAdminId ? "Cannot change own role here" : "Change user role"}
                    >
                      {ROLES.map((roleOption) => ( <option key={roleOption} value={roleOption}> {roleOption} </option> ))}
                    </select>
                    {/* Delete Button */}
                    <button
                        onClick={() => handleDeleteUser(user.id, user.email)}
                        disabled={user.id === currentAdminId}
                        className="p-1 text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={user.id === currentAdminId ? "Cannot delete self" : "Delete User"}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"> <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /> </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminPage;
