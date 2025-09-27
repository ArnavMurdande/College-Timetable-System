// File: client/src/context/DepartmentContext.jsx

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../App'; // To get user role and token

const API_BASE_URL = 'http://localhost:5001/api';

const DepartmentContext = createContext(null);

export function useDepartment() {
  return useContext(DepartmentContext);
}

export function DepartmentProvider({ children }) {
  const { isLoggedIn, userInfo } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false);
  const [departmentError, setDepartmentError] = useState('');

  const fetchDepartments = useCallback(async () => {
    if (!isLoggedIn) {
        setDepartments([]);
        setSelectedDepartment(null);
        return;
    }

    setIsLoadingDepartments(true);
    setDepartmentError('');
    const token = localStorage.getItem('authToken');
    if (!token) {
      setDepartmentError("Authentication token not found.");
      setIsLoadingDepartments(false);
      setDepartments([]);
      return;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/departments`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      setDepartments(response.data || []);
    } catch (err) {
      console.error("Fetch Departments Error:", err);
      setDepartmentError(err.response?.data?.message || 'Failed to fetch departments.');
      setDepartments([]);
    } finally {
      setIsLoadingDepartments(false);
    }
  }, [isLoggedIn]); // Removed userInfo?.role as all logged-in users can fetch

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  const addDepartment = async (name) => {
    if (userInfo?.role !== 'Admin') {
      setDepartmentError('Only admins can add departments.');
      return null;
    }
    const token = localStorage.getItem('authToken');
    if (!token) {
      setDepartmentError("Authentication token not found.");
      return null;
    }
    setDepartmentError('');
    try {
      const response = await axios.post(`${API_BASE_URL}/departments`, { name }, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      fetchDepartments(); 
      return response.data.department;
    } catch (err) {
      console.error("Add Department Error:", err);
      setDepartmentError(err.response?.data?.message || 'Failed to add department.');
      return null;
    }
  };

  // New function to delete a department
  const deleteDepartment = async (departmentId) => {
    if (userInfo?.role !== 'Admin') {
      setDepartmentError('Only admins can delete departments.');
      throw new Error('Unauthorized action.'); // Throw error to be caught by caller
    }
    const token = localStorage.getItem('authToken');
    if (!token) {
      setDepartmentError("Authentication token not found.");
      throw new Error('Authentication token not found.'); // Throw error
    }
    setDepartmentError('');
    try {
      await axios.delete(`${API_BASE_URL}/departments/${departmentId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      // If the deleted department was the selected one, reset selection
      if (selectedDepartment && selectedDepartment.id === departmentId) {
        setSelectedDepartment(null);
      }
      fetchDepartments(); // Refresh the list
    } catch (err) {
      console.error("Delete Department Error in Context:", err);
      const errorMessage = err.response?.data?.message || 'Failed to delete department from context.';
      setDepartmentError(errorMessage);
      throw new Error(errorMessage); // Re-throw for the component to handle
    }
  };


  const handleSelectDepartment = (department) => {
    setSelectedDepartment(department);
  };

  const value = {
    departments,
    selectedDepartment,
    isLoadingDepartments,
    departmentError,
    fetchDepartments,
    addDepartment,
    deleteDepartment, // Expose the new function
    handleSelectDepartment,
    setDepartmentError 
  };

  return (
    <DepartmentContext.Provider value={value}>
      {children}
    </DepartmentContext.Provider>
  );
}
