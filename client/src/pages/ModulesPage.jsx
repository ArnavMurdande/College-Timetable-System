// File: client/src/pages/ModulesPage.jsx

import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useDepartment } from '../context/DepartmentContext';
import { useAuth } from '../App';
import axios from 'axios'; // Import axios for the new deleteDepartmentHandler

const API_BASE_URL = 'http://localhost:5001/api'; // Define API_BASE_URL if not already defined

function ModulesPage() {
  const {
    departments,
    selectedDepartment,
    handleSelectDepartment,
    addDepartment,
    isLoadingDepartments,
    departmentError,
    setDepartmentError,
    fetchDepartments,
    // Add deleteDepartmentFromContext if it will be added to context, otherwise handle API call here
  } = useDepartment();
  const { userInfo } = useAuth();

  const [showAddDepartmentForm, setShowAddDepartmentForm] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [isAddingDepartment, setIsAddingDepartment] = useState(false);
  const [isDeletingDepartment, setIsDeletingDepartment] = useState(false); // New state for delete operation

  const allModules = [
    { name: "Room Management", path: "/modules/room-management", roles: ['Admin', 'Faculty'], icon: "BuildingLibraryIcon" },
    { name: "Subject Management", path: "/modules/subject-management", roles: ['Admin', 'Faculty'], icon: "BookOpenIcon" },
    { name: "Faculty Management", path: "/modules/faculty-management", roles: ['Admin', 'Faculty'], icon: "UsersIcon" },
    { name: "Syllabus Management", path: "/modules/syllabus-management", roles: ['Admin', 'Faculty'], icon: "DocumentTextIcon" },
    { name: "Division & Batch Management", path: "/modules/division-batch-management", roles: ['Admin', 'Faculty'], icon: "TableCellsIcon" },
    { name: "Student Elective Choices", path: "/modules/student-elective-choices", roles: ['Admin', 'Faculty'], icon: "PencilSquareIcon" },
    { name: "Load Allocation", path: "/modules/load-allocation", roles: ['Admin', 'Faculty'], icon: "ArrowsRightLeftIcon" },
    { name: "Load Calculation", path: "/modules/load-calculation", roles: ['Admin', 'Faculty'], icon: "CalculatorIcon" },
    { name: "Timetable Management", path: "/modules/timetable-management", roles: ['Admin'], icon: "CalendarDaysIcon" },
    { name: "Scheduling & Events", path: "/modules/scheduling-events", roles: ['Admin', 'Faculty'], icon: "ClockIcon" },
    { name: "View Timetable", path: "/modules/view-timetable", roles: ['Admin', 'Faculty'], icon: "EyeIcon" },
    { name: "About", path: "/modules/about", roles: ['Admin', 'Faculty'], icon: "InformationCircleIcon" },
  ];

  const Icons = {
    BuildingLibraryIcon: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mb-2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" /></svg>,
    BookOpenIcon: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mb-2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6-2.292m0 0V3.75m0 12.508V18" /></svg>,
    UsersIcon: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mb-2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>,
    DocumentTextIcon: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mb-2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>,
    TableCellsIcon: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mb-2"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h12A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6ZM3.75 12h16.5M12 3.75v16.5" /></svg>,
    PencilSquareIcon: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mb-2"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>,
    ArrowsRightLeftIcon: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mb-2"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h18M16.5 3l4.5 4.5m0 0L16.5 12M21 7.5H3" /></svg>,
    CalculatorIcon: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mb-2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.504-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V18Zm2.498-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5ZM8.25 6h7.5v2.25h-7.5V6ZM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0 0 12 2.25Z" /></svg>,
    CalendarDaysIcon: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mb-2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z" /></svg>,
    ClockIcon: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mb-2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>,
    EyeIcon: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mb-2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>,
    InformationCircleIcon: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mb-2"><path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>,
  };

  const isAdmin = userInfo?.role === 'Admin';
  const visibleModules = allModules.filter(module => module.roles.includes(userInfo?.role));

  useEffect(() => {
    if (selectedDepartment && departments.length > 0 && !departments.find(d => d.id === selectedDepartment.id)) {
        handleSelectDepartment(null);
    }
  }, [departments, selectedDepartment, handleSelectDepartment]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments, userInfo]);


  const handleAddNewDepartmentSubmit = async (e) => {
    e.preventDefault();
    if (!newDepartmentName.trim() || !isAdmin) return;
    setIsAddingDepartment(true);
    setDepartmentError('');
    const addedDepartment = await addDepartment(newDepartmentName.trim());
    if (addedDepartment) {
      setNewDepartmentName('');
      setShowAddDepartmentForm(false);
      // Optionally select the newly added department
      // handleSelectDepartment(addedDepartment); 
    }
    setIsAddingDepartment(false);
  };

  // New handler for deleting a department
  const handleDeleteDepartment = async () => {
    if (!selectedDepartment || !isAdmin) {
        setDepartmentError("No department selected or unauthorized action.");
        return;
    }
    // A simple confirmation dialog. For a better user experience, consider a custom modal.
    if (!window.confirm(`Are you sure you want to delete the department "${selectedDepartment.name}"? This action cannot be undone and might affect associated data.`)) {
        return;
    }
    setIsDeletingDepartment(true);
    setDepartmentError('');
    const token = localStorage.getItem('authToken');
    if (!token) {
        setDepartmentError("Authentication token not found.");
        setIsDeletingDepartment(false);
        return;
    }

    try {
        // CORRECTED API call using proper template literal syntax
        await axios.delete(`${API_BASE_URL}/departments/${selectedDepartment.id}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        // After successful deletion, provide feedback to the user.
        // Consider using a more robust notification system than alert().
        alert(`Department "${selectedDepartment.name}" deleted successfully.`); 
        handleSelectDepartment(null); // Deselect the department
        fetchDepartments(); // Refresh the list of departments to reflect the deletion
    } catch (err) {
        console.error("Delete Department Error:", err);
        // Provide a user-friendly error message from the server response if available
        setDepartmentError(err.response?.data?.message || 'Failed to delete department.');
    } finally {
        setIsDeletingDepartment(false);
    }
  };


  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-3 md:gap-4">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-800 dark:text-white text-center md:text-left">
          {selectedDepartment ? `${selectedDepartment.name} - ` : "All Departments - "}
          <span className="font-semibold">Modules</span>
        </h1>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedDepartment ? selectedDepartment.id : ""}
            onChange={(e) => {
              const deptId = e.target.value;
              handleSelectDepartment(deptId ? departments.find(d => d.id === parseInt(deptId)) : null);
            }}
            className="form-select block w-full sm:w-auto py-2.5 px-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-700 dark:text-gray-200"
            disabled={isLoadingDepartments || isAddingDepartment || isDeletingDepartment}
            aria-label="Select Department"
          >
            <option value="">All Departments</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </select>
          {isAdmin && (
            <div className="flex gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
                <button
                    onClick={() => { setShowAddDepartmentForm(true); setDepartmentError(''); }}
                    className="p-2.5 bg-green-600 hover:bg-green-700 text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 text-sm flex-1 sm:flex-none flex items-center justify-center"
                    title="Add New Department"
                    disabled={isAddingDepartment || isLoadingDepartments || isDeletingDepartment}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    <span className="text-xs sm:text-sm">Add Dept</span>
                </button>
                {/* Delete Department Button - NEW */}
                {selectedDepartment && (
                    <button
                        onClick={handleDeleteDepartment}
                        className="p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 text-sm flex-1 sm:flex-none flex items-center justify-center"
                        title={`Delete ${selectedDepartment.name}`}
                        disabled={isAddingDepartment || isLoadingDepartments || isDeletingDepartment}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span className="text-xs sm:text-sm">Del Dept</span>
                    </button>
                )}
            </div>
          )}
        </div>
      </div>

      {departmentError && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-300 p-4 rounded-md relative mb-4 text-sm shadow-md" role="alert">
          <button onClick={() => setDepartmentError('')} className="absolute top-0 bottom-0 right-0 px-4 py-3 font-bold">&times;</button>
          <strong className="font-bold block">Department Operation Error:</strong>
          <span>{departmentError}</span>
        </div>
      )}

      {isAdmin && showAddDepartmentForm && (
        <form onSubmit={handleAddNewDepartmentSubmit} className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/70 rounded-lg shadow-md border dark:border-gray-700">
          <h3 className="text-lg font-medium mb-3 text-gray-700 dark:text-gray-200">Add New Department</h3>
          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            <input
              type="text"
              value={newDepartmentName}
              onChange={(e) => setNewDepartmentName(e.target.value)}
              placeholder="Enter new department name"
              className="form-input flex-grow px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
              disabled={isAddingDepartment}
            />
            <div className="flex gap-2 mt-2 sm:mt-0">
              <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm disabled:opacity-50 flex-1 sm:flex-none text-sm" disabled={isAddingDepartment || !newDepartmentName.trim()}>
                {isAddingDepartment ? 'Adding...' : 'Save Department'}
              </button>
              <button type="button" onClick={() => {setShowAddDepartmentForm(false); setNewDepartmentName(''); setDepartmentError('');}} className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 dark:text-gray-100 dark:bg-gray-600 dark:hover:bg-gray-500 rounded-md shadow-sm disabled:opacity-50 flex-1 sm:flex-none text-sm" disabled={isAddingDepartment}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {isLoadingDepartments && <p className="text-center text-gray-600 dark:text-gray-400 py-4">Loading departments...</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {visibleModules.map(module => {
          const IconComponent = Icons[module.icon] || Icons.BookOpenIcon; 
          return (
            <NavLink
              key={module.name}
              to={module.path}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center text-center p-6 sm:py-8 sm:px-4 rounded-lg shadow-lg hover:shadow-xl 
                text-white transition-all duration-300 transform hover:-translate-y-1.5
                ${isActive 
                  ? 'bg-gradient-to-br from-blue-600 to-blue-800 dark:from-blue-500 dark:to-blue-700 ring-2 ring-offset-2 ring-blue-400 dark:ring-offset-gray-800 dark:ring-blue-500' 
                  : 'bg-gradient-to-br from-indigo-500 to-purple-600 dark:from-indigo-600 dark:to-purple-700 hover:from-indigo-600 hover:to-purple-700 dark:hover:from-indigo-700 dark:hover:to-purple-800'
                }`
              }
            >
              <IconComponent />
              <span className="text-base sm:text-lg font-semibold">{module.name}</span>
            </NavLink>
          );
        })}
      </div>

      {visibleModules.length === 0 && !isLoadingDepartments && (
        <p className="text-center text-gray-600 dark:text-gray-400 mt-10 py-6 bg-white dark:bg-gray-800/50 rounded-lg shadow">
            No modules available for your role or the selected criteria.
        </p>
      )}
    </div>
  );
}

export default ModulesPage;
