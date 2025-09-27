// File: client/src/pages/FacultyManagementPage.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../App';
import { useDepartment } from '../context/DepartmentContext'; 
import * as XLSX from 'xlsx'; // Added for Excel export

const API_BASE_URL = 'http://localhost:5001/api';

const FACULTY_DESIGNATIONS = [
    'HOD', 'Professor', 'AssociateProfessor', 'AssistantProfessor'
];

const formatDesignation = (designation) => {
    if (!designation) return 'N/A';
    return designation.replace(/([A-Z])/g, ' $1').replace(/^ /, '');
};

function FacultyManagementPage() {
    const { userInfo } = useAuth();
    const { departments, isLoadingDepartments, fetchDepartments: fetchContextDepartments, selectedDepartment } = useDepartment();

    const [facultyList, setFacultyList] = useState([]);
    const [linkableUsers, setLinkableUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [showForm, setShowForm] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [currentFacultyId, setCurrentFacultyId] = useState(null);
    const [formData, setFormData] = useState({
        userId: '', 
        name: '',
        uniqueId: '',
        departmentId: '', 
        designation: FACULTY_DESIGNATIONS[0], 
    });
    const [formError, setFormError] = useState('');

    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [uploadSuccess, setUploadSuccess] = useState('');
    const [uploadResults, setUploadResults] = useState(null);

    const [filters, setFilters] = useState({
        name: '',
        uniqueId: '',
        departmentId: '', 
        designation: '',
    });

    const isAdmin = useMemo(() => userInfo?.role === 'Admin', [userInfo]);

    const fetchFacultyList = useCallback(async () => {
        setIsLoading(true);
        setError('');
        setSuccessMessage('');
        const token = localStorage.getItem('authToken');
        if (!token) {
            setError('Authentication required.');
            setIsLoading(false);
            return;
        }
        try {
            const queryParams = new URLSearchParams();
            if (filters.name) queryParams.append('name', filters.name);
            if (filters.uniqueId) queryParams.append('uniqueId', filters.uniqueId);
            
            if (selectedDepartment?.id) {
                queryParams.append('departmentId', selectedDepartment.id);
            } else if (filters.departmentId) {
                queryParams.append('departmentId', filters.departmentId);
            }

            if (filters.designation) queryParams.append('designation', filters.designation);

            const response = await axios.get(`${API_BASE_URL}/faculty?${queryParams.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setFacultyList(response.data || []);
        } catch (err) {
            console.error("Fetch Faculty List Error:", err);
            setError(err.response?.data?.message || 'Failed to fetch faculty list.');
        } finally {
            setIsLoading(false);
        }
    }, [filters, selectedDepartment]); 

    const fetchLinkableUsers = useCallback(async () => {
        if (!isAdmin) return;
        const token = localStorage.getItem('authToken');
        if (!token) return;
        try {
            const response = await axios.get(`${API_BASE_URL}/faculty/linkable-users`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setLinkableUsers(response.data || []);
        } catch (err) {
            console.error("Fetch Linkable Users Error:", err);
            setFormError(err.response?.data?.message || 'Failed to fetch users to link.');
        }
    }, [isAdmin]);

    useEffect(() => {
        fetchFacultyList();
        if (departments.length === 0 && !isLoadingDepartments) {
            fetchContextDepartments();
        }
    }, [fetchFacultyList, departments.length, isLoadingDepartments, fetchContextDepartments]);

    useEffect(() => {
        if (showForm && isAdmin) { 
            fetchLinkableUsers();
        }
    }, [showForm, isAdmin, fetchLinkableUsers]);


    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const resetFilters = () => {
        setFilters({ name: '', uniqueId: '', departmentId: '', designation: '' });
    };

    const resetForm = () => {
        setFormData({
            userId: '', 
            name: '',
            uniqueId: '',
            departmentId: selectedDepartment?.id || '',
            designation: FACULTY_DESIGNATIONS[0], 
        });
        setCurrentFacultyId(null);
        setIsEditMode(false);
        setShowForm(false);
        setFormError('');
        setSuccessMessage('');
    };

    const handleAddFormShow = () => {
        resetForm(); 
        setShowForm(true);
        setIsEditMode(false);
    };

    const handleEditFormShow = (faculty) => {
        resetForm();
        setFormData({
            userId: faculty.userId || '', 
            name: faculty.name || '',
            uniqueId: faculty.uniqueId || '',
            departmentId: faculty.departmentId || '',
            designation: faculty.designation || FACULTY_DESIGNATIONS[0],
        });
        setCurrentFacultyId(faculty.id);
        setIsEditMode(true);
        setShowForm(true);
    };

    const handleSubmitForm = async (e) => {
        e.preventDefault();
        setFormError('');
        setSuccessMessage('');
        const token = localStorage.getItem('authToken');
        if (!token || !isAdmin) {
            setFormError('Unauthorized action.');
            return;
        }

        if (!formData.name.trim() || !formData.uniqueId.trim() || !formData.departmentId || !formData.designation) {
            setFormError('Full Name, Unique ID, Department, and Designation are required.');
            return;
        }

        const payload = {
            name: formData.name,
            uniqueId: formData.uniqueId,
            departmentId: formData.departmentId,
            designation: formData.designation,
        };
        
        if (isEditMode && formData.userId) {
            payload.userId = formData.userId;
        } else if (isEditMode && formData.userId === '') { 
             payload.userId = null;
        }

        setIsLoading(true);
        try {
            if (isEditMode) {
                await axios.put(`${API_BASE_URL}/faculty/${currentFacultyId}`, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setSuccessMessage('Faculty record updated successfully!');
            } else {
                await axios.post(`${API_BASE_URL}/faculty`, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setSuccessMessage('Faculty record created successfully!');
            }
            resetForm();
            fetchFacultyList();
        } catch (err) {
            console.error("Submit Faculty Error:", err);
            setFormError(err.response?.data?.message || 'Failed to save faculty record.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteFaculty = async (facultyId, facultyName) => {
        if (!window.confirm(`Are you sure you want to delete faculty record for ${facultyName} (ID: ${facultyId})?`)) return;
        setSuccessMessage(''); setError('');
        const token = localStorage.getItem('authToken');
        if (!token || !isAdmin) { setError('Unauthorized action.'); return; }
        setIsLoading(true);
        try {
            await axios.delete(`${API_BASE_URL}/faculty/${facultyId}`, { headers: { Authorization: `Bearer ${token}` } });
            setSuccessMessage(`Faculty record for ${facultyName} deleted successfully!`);
            fetchFacultyList();
        } catch (err) {
            console.error("Delete Faculty Error:", err);
            setError(err.response?.data?.message || 'Failed to delete faculty record.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileChange = (event) => {
        setFile(event.target.files[0]);
        setUploadError(''); setUploadSuccess(''); setUploadResults(null);
    };

    const handleFacultyFileUpload = async () => {
        if (!file) { setUploadError("Please select a file."); return; }
        setIsUploading(true); setUploadError(''); setUploadSuccess(''); setUploadResults(null);
        const token = localStorage.getItem('authToken');
        const fileData = new FormData();
        fileData.append('file', file);

        try {
            const response = await axios.post(`${API_BASE_URL}/faculty/upload`, fileData, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
            });
            setUploadSuccess(response.data.message || "File processed.");
            setUploadResults({ createdCount: response.data.createdCount, errors: response.data.errors });
            fetchFacultyList();
        } catch (err) {
            console.error("Faculty file upload error:", err.response);
            setUploadError(err.response?.data?.message || "Faculty file upload failed.");
            if(err.response?.data?.errors) {
                setUploadResults({ errors: err.response.data.errors });
            }
        } finally {
            setIsUploading(false); setFile(null);
            if (document.getElementById('faculty-file-upload')) {
                 document.getElementById('faculty-file-upload').value = "";
            }
        }
    };

    // Function to handle Excel download for Faculty
    const handleDownloadFacultyExcel = () => {
        if (facultyList.length === 0) {
        alert("No faculty data to export.");
        return;
        }
        const dataToExport = facultyList.map(faculty => ({
        "Name": faculty.name,
        "Unique ID": faculty.uniqueId,
        "Department": faculty.department?.name || 'N/A',
        "Designation": formatDesignation(faculty.designation),
        "Linked User Email": faculty.user?.email || "Not Linked",
        "Last Updated": new Date(faculty.updatedAt).toLocaleString(),
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Faculty");
        XLSX.writeFile(workbook, `Faculty_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
        setSuccessMessage("Faculty data exported to Excel successfully.");
    };
    
    const inputStyle = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 disabled:opacity-70";
    const labelStyle = "block text-sm font-medium text-gray-700 dark:text-gray-300";
    const buttonPrimaryStyle = "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50";
    const buttonSecondaryStyle = "px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100 rounded-md text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 disabled:opacity-50";
    const tableHeaderStyle = "px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider";
    const tableCellStyle = "px-3 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300";

    return (
        <div className="container mx-auto p-4 md:p-6">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-3 md:gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">
                    Faculty Management {selectedDepartment ? `(${selectedDepartment.name})` : ''}
                </h1>
                 {isAdmin && !showForm && (
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <button onClick={handleDownloadFacultyExcel} disabled={isLoading || facultyList.length === 0} className={`w-full sm:w-auto ${buttonSecondaryStyle} bg-teal-600 hover:bg-teal-700 text-white disabled:bg-teal-400`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            Export Excel
                        </button>
                        <button onClick={handleAddFormShow} className={`${buttonPrimaryStyle} bg-green-600 hover:bg-green-700 w-full sm:w-auto`}>
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                            Add New Faculty
                        </button>
                    </div>
                )}
            </div>


            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-300 p-4 mb-4 rounded-md" role="alert">{error}</div>}
            {successMessage && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-300 p-4 mb-4 rounded-md" role="alert">{successMessage}</div>}

            {isAdmin && !showForm && (
                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg shadow border dark:border-gray-700">
                    <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200">Bulk Upload Faculty</h3>
                    <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                        <div className="flex-grow">
                            <label htmlFor="faculty-file-upload" className={labelStyle}>Upload CSV/Excel File</label>
                            <input type="file" id="faculty-file-upload" onChange={handleFileChange} accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" className={`${inputStyle} p-1.5`} disabled={isUploading} />
                        </div>
                        <button onClick={handleFacultyFileUpload} className={`${buttonPrimaryStyle} mt-2 sm:mt-0`} disabled={isUploading || !file}>
                            {isUploading ? 'Uploading...' : 'Upload Faculty File'}
                        </button>
                    </div>
                    {uploadError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{uploadError}</p>}
                    {uploadSuccess && <p className="mt-2 text-sm text-green-600 dark:text-green-400">{uploadSuccess}</p>}
                    {uploadResults?.errors?.length > 0 && (
                        <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                            <p className="font-semibold">Upload finished with errors:</p>
                            <ul className="list-disc list-inside max-h-32 overflow-y-auto">
                                {uploadResults.errors.map((err, index) => (
                                    <li key={index}>Row {err.row || 'N/A'} (ID: {err.uniqueId || 'N/A'}): {err.message}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {isAdmin && showForm && (
                <form onSubmit={handleSubmitForm} className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700">
                    <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">{isEditMode ? 'Edit Faculty Record' : 'Add New Faculty Record'}</h2>
                    {formError && <div className="bg-red-100 text-red-700 p-3 mb-3 rounded-md text-sm" role="alert">{formError}</div>}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {isEditMode && (
                            <div>
                                <label htmlFor="userId" className={labelStyle}>Link to User Account (Optional)</label>
                                <select name="userId" id="userId" value={formData.userId} onChange={handleInputChange} className={inputStyle}>
                                    <option value="">-- Unlink / No User Account --</option>
                                    {linkableUsers.map(user => <option key={user.id} value={user.id}>{user.email}</option>)}
                                    {formData.userId && !linkableUsers.find(u=>u.id === formData.userId) && facultyList.find(f=>f.id === currentFacultyId)?.user && (
                                        <option value={formData.userId} disabled>
                                            Currently: {facultyList.find(f=>f.id === currentFacultyId)?.user?.email}
                                        </option>
                                    )}
                                </select>
                            </div>
                        )}
                        <div>
                            <label htmlFor="name" className={labelStyle}>Full Name*</label>
                            <input type="text" name="name" id="name" value={formData.name} onChange={handleInputChange} required className={inputStyle} placeholder="Faculty member's full name" />
                        </div>
                        <div>
                            <label htmlFor="uniqueId" className={labelStyle}>Unique ID*</label>
                            <input type="text" name="uniqueId" id="uniqueId" value={formData.uniqueId} onChange={handleInputChange} required className={inputStyle} placeholder="e.g., College Employee ID" />
                        </div>
                        <div>
                            <label htmlFor="departmentId" className={labelStyle}>Department*</label>
                            <select name="departmentId" id="departmentId" value={formData.departmentId} onChange={handleInputChange} required className={inputStyle} disabled={isLoadingDepartments}>
                                <option value="">-- Select Department --</option>
                                {departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="designation" className={labelStyle}>Designation*</label>
                            <select name="designation" id="designation" value={formData.designation} onChange={handleInputChange} required className={inputStyle}>
                                <option value="">-- Select Designation --</option>
                                {FACULTY_DESIGNATIONS.map(desig => <option key={desig} value={desig}>{formatDesignation(desig)}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end space-x-3">
                        <button type="button" onClick={resetForm} className={buttonSecondaryStyle} disabled={isLoading}>Cancel</button>
                        <button type="submit" className={buttonPrimaryStyle} disabled={isLoading}>
                            {isLoading ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Record' : 'Create Record')}
                        </button>
                    </div>
                </form>
            )}

            {!showForm && (
                 <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg shadow border dark:border-gray-700">
                    <h3 className="text-lg font-medium mb-3 text-gray-700 dark:text-gray-200">Filter Faculty Records</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        <input type="text" name="name" placeholder="Filter by Name" value={filters.name} onChange={handleFilterChange} className={inputStyle} />
                        <input type="text" name="uniqueId" placeholder="Filter by Unique ID" value={filters.uniqueId} onChange={handleFilterChange} className={inputStyle} />
                        {!selectedDepartment?.id && (
                            <select name="departmentId" value={filters.departmentId} onChange={handleFilterChange} className={inputStyle} disabled={isLoadingDepartments}>
                                <option value="">All Departments (Local Filter)</option>
                                {departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                            </select>
                        )}
                        <select name="designation" value={filters.designation} onChange={handleFilterChange} className={inputStyle}>
                            <option value="">All Designations</option>
                            {FACULTY_DESIGNATIONS.map(desig => <option key={desig} value={desig}>{formatDesignation(desig)}</option>)}
                        </select>
                         <button onClick={resetFilters} className={`${buttonSecondaryStyle} text-xs col-span-full sm:col-span-1 lg:col-auto self-end`}>Reset Page Filters</button>
                    </div>
                </div>
            )}

            {isLoading && <p className="text-center text-gray-600 dark:text-gray-400 py-10">Loading faculty records...</p>}
            {!isLoading && facultyList.length === 0 && !showForm && (
                <p className="text-center text-gray-600 dark:text-gray-400 py-10 bg-white dark:bg-gray-800 rounded-lg shadow">No faculty records found matching criteria.</p>
            )}
            {!isLoading && facultyList.length > 0 && !showForm && (
                <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow-lg rounded-lg border dark:border-gray-700">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700/70">
                            <tr>
                                <th className={tableHeaderStyle}>Name</th>
                                <th className={tableHeaderStyle}>Unique ID</th>
                                <th className={tableHeaderStyle}>Department</th>
                                <th className={tableHeaderStyle}>Designation</th>
                                <th className={tableHeaderStyle}>Linked User Email</th>
                                {isAdmin && <th className={tableHeaderStyle}>Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {facultyList.map(faculty => (
                                <tr key={faculty.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className={`${tableCellStyle} font-semibold`}>{faculty.name}</td>
                                    <td className={tableCellStyle}>{faculty.uniqueId}</td>
                                    <td className={tableCellStyle}>{faculty.department?.name || 'N/A'}</td>
                                    <td className={tableCellStyle}>{formatDesignation(faculty.designation)}</td>
                                    <td className={tableCellStyle}>{faculty.user?.email || <span className="italic text-gray-400">Not Linked</span>}</td>
                                    {isAdmin && (
                                        <td className={`${tableCellStyle} space-x-2`}>
                                            <button onClick={() => handleEditFormShow(faculty)} className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 text-xs font-medium">Edit</button>
                                            <button onClick={() => handleDeleteFaculty(faculty.id, faculty.name)} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs font-medium">Delete</button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default FacultyManagementPage;
