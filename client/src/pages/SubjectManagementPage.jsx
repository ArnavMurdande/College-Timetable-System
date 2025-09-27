// File: client/src/pages/SubjectManagementPage.jsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../App';
import { useDepartment } from '../context/DepartmentContext';
import * as XLSX from 'xlsx'; // For Excel export

const API_BASE_URL = 'http://localhost:5001/api';
const SUBJECT_TYPES_CONFIG = [
    { value: 'Common', label: 'Common Subjects' },
    { value: 'DLO', label: 'Department Level Optional (DLO)' },
    { value: 'ILOT', label: 'Institute Level Optional (ILOT)' },
    { value: 'MajorMinor', label: 'Major/Minor Subjects' },
];
const YEARS = [
    { value: 1, label: 'FE (First Year)' },
    { value: 2, label: 'SE (Second Year)' },
    { value: 3, label: 'TE (Third Year)' },
    { value: 4, label: 'BE (Fourth Year)' },
];
const SEMESTER_TYPES = [
    { value: 'odd', label: 'Odd' },
    { value: 'even', label: 'Even' },
];
const SUBJECT_TYPE_DISPLAY_MAP = {
    Common: 'Common', DLO: 'DLO', ILOT: 'ILOT', MajorMinor: 'Major/Minor',
};

function SubjectManagementPage() {
    const { userInfo } = useAuth();
    const { departments, isLoadingDepartments, fetchDepartments: fetchContextDepartments, selectedDepartment: globalSelectedDepartment } = useDepartment();

    const [subjects, setSubjects] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [showAddSubjectMode, setShowAddSubjectMode] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);

    const [formDepartmentId, setFormDepartmentId] = useState('');
    const [formYear, setFormYear] = useState('');
    const [formSemesterType, setFormSemesterType] = useState('');
    const [subjectCounts, setSubjectCounts] = useState({ Common: 0, DLO: 0, ILOT: 0, MajorMinor: 0 });
    const [electiveOptionsCounts, setElectiveOptionsCounts] = useState({ DLO: [], ILOT: [], MajorMinor: [] });
    const [detailedSubjectsData, setDetailedSubjectsData] = useState([]);
    const [formError, setFormError] = useState('');

    const [viewFilters, setViewFilters] = useState({
        departmentId: '', year: '', semester: '', subjectType: '', courseCategory: '', code: '', name: '', courseGroup: '', // Added courseGroup to viewFilters
        semesterTypeForFilter: ''
    });
    const [sortConfig, setSortConfig] = useState({ key: 'code', direction: 'asc' });

    const [showEditModal, setShowEditModal] = useState(false);
    const [editingSubject, setEditingSubject] = useState(null);
    const [editFormData, setEditFormData] = useState({});
    const [editFormError, setEditFormError] = useState('');
    const [isUpdatingSubject, setIsUpdatingSubject] = useState(false);

    const [fileToUpload, setFileToUpload] = useState(null);
    const [isUploadingFile, setIsUploadingFile] = useState(false);
    const [uploadFileError, setUploadFileError] = useState('');
    const [uploadFileSuccess, setUploadFileSuccess] = useState('');
    const fileInputRef = useRef(null);

    const isAdmin = useMemo(() => userInfo?.role === 'Admin', [userInfo]);

    // Centralized fetch logic
    const fetchExistingSubjects = useCallback(async (filters, sorting) => {
        if (showAddSubjectMode) return;
        setIsLoading(true);
        setError('');
        const token = localStorage.getItem('authToken');
        if (!token) {
            setError('Authentication required.');
            setIsLoading(false);
            return;
        }

        try {
            const queryParams = new URLSearchParams();
            // Build query params from the provided filters object
            if (filters.departmentId) queryParams.append('departmentId', filters.departmentId);
            if (filters.year) queryParams.append('year', filters.year);
            if (filters.semester) queryParams.append('semester', filters.semester);
            if (filters.subjectType) queryParams.append('subjectType', filters.subjectType);
            if (filters.courseCategory) queryParams.append('courseCategory', filters.courseCategory);
            if (filters.code) queryParams.append('code', filters.code);
            if (filters.name) queryParams.append('name', filters.name);
            if (filters.courseGroup) queryParams.append('courseGroup', filters.courseGroup);

            if (sorting.key) {
                queryParams.append('sortBy', sorting.key);
                queryParams.append('order', sorting.direction);
            }

            const response = await axios.get(`${API_BASE_URL}/subjects?${queryParams.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setSubjects(response.data || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch subjects.');
            setSubjects([]);
        } finally {
            setIsLoading(false);
        }
    }, [showAddSubjectMode]);

    // Effect to update filters when the global department changes
    useEffect(() => {
        const newDeptId = globalSelectedDepartment ? globalSelectedDepartment.id : '';
        setFormDepartmentId(newDeptId); // Keep form department in sync
        
        // **FIX:** Reset filters and apply the new department ID directly.
        // This ensures that the state update is atomic and predictable.
        setViewFilters(prevFilters => {
            // Only update if the department has actually changed
            if (prevFilters.departmentId !== newDeptId) {
                return {
                    // Reset all filters to avoid inconsistencies
                    departmentId: newDeptId,
                    year: '',
                    semester: '',
                    subjectType: '',
                    courseCategory: '',
                    code: '',
                    name: '',
                    courseGroup: '',
                    semesterTypeForFilter: ''
                };
            }
            // If department ID is the same, no change is needed
            return prevFilters;
        });
    }, [globalSelectedDepartment]);

    // Effect to fetch subjects whenever filters or sorting change
    useEffect(() => {
        if (!showAddSubjectMode) {
            fetchExistingSubjects(viewFilters, sortConfig);
        }
    }, [viewFilters, sortConfig, showAddSubjectMode, fetchExistingSubjects]);

    useEffect(() => {
        if (departments.length === 0 && !isLoadingDepartments) {
            fetchContextDepartments();
        }
    }, [departments.length, isLoadingDepartments, fetchContextDepartments]);
    
    const handleViewFilterChange = (e) => {
        const { name, value } = e.target;
        setViewFilters(prev => ({ ...prev, [name]: value }));
    };
    
    const handleViewFilterSemesterTypeChange = (e) => {
        const semesterType = e.target.value;
        const currentYear = viewFilters.year;
        setViewFilters(prev => {
            let newSemester = '';
            if (currentYear && semesterType) {
                const yearNum = parseInt(currentYear);
                newSemester = semesterType.toLowerCase() === 'odd' ? (yearNum * 2 - 1).toString() : (yearNum * 2).toString();
            }
            return { ...prev, semester: newSemester, semesterTypeForFilter: semesterType };
        });
    };
    
    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };
    
    const getSortIndicator = (key) => {
        if (sortConfig.key === key) {
            return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
        }
        return '';
    };

    const resetAllFormData = () => {
        setFormDepartmentId(globalSelectedDepartment?.id || '');
        setFormYear('');
        setFormSemesterType('');
        setSubjectCounts({ Common: 0, DLO: 0, ILOT: 0, MajorMinor: 0 });
        setElectiveOptionsCounts({ DLO: [], ILOT: [], MajorMinor: [] });
        setDetailedSubjectsData([]);
        setFormError(''); 
    };
    
    const calculatedSemesterForForm = useMemo(() => {
        if (formYear && formSemesterType) {
            const yearNum = parseInt(formYear);
            if (formSemesterType.toLowerCase() === 'odd') return yearNum * 2 - 1;
            if (formSemesterType.toLowerCase() === 'even') return yearNum * 2;
        }
        return null;
    }, [formYear, formSemesterType]);

    // MODIFIED: initializeDetailedSubjectsData to include courseGroup
    const initializeDetailedSubjectsData = () => {
        const data = [];
        const semester = calculatedSemesterForForm;
        const currentYear = parseInt(formYear);

        // Common Subjects
        for (let i = 0; i < (subjectCounts.Common || 0); i++) {
            data.push({
                id: `common_${i}`, uiGroupName: `Common Subject ${i + 1}`, subjectType: 'Common',
                courseGroup: 'Common', // Assign courseGroup
                code: '', name: '', courseCategory: 'PCC', theoryHours: 3, practicalHours: 0, labRequirements: '',
                departmentId: formDepartmentId, year: currentYear, semester: semester,
            });
        }

        // DLO, ILOT, MajorMinor Subjects
        ['DLO', 'ILOT', 'MajorMinor'].forEach(type => {
            for (let i = 0; i < (subjectCounts[type] || 0); i++) {
                const numOptions = electiveOptionsCounts[type][i] || 1;
                const groupName = `${type}${i + 1}`; // This becomes the courseGroup
                const options = [];
                for (let j = 0; j < numOptions; j++) {
                    options.push({
                        id: `${type}_${i}_option_${j}`, subjectType: type, 
                        courseGroup: groupName, // Assign courseGroup (e.g., DLO1, ILOT2)
                        code: '', name: '', courseCategory: `${groupName}-Option${j+1}`, // Course category can be more specific
                        theoryHours: 3, practicalHours: (type === 'ILOT' ? 0 : 2), labRequirements: '',
                        departmentId: formDepartmentId, year: currentYear, semester: semester,
                    });
                }
                data.push({
                    id: `${type}_group_${i}`, uiGroupName: groupName, isElectiveGroup: true,
                    subjectTypeForGroup: type, 
                    courseGroupForDisplay: groupName, // For display purposes in the UI if needed
                    options: options,
                });
            }
        });
        setDetailedSubjectsData(data);
    };
    
    const handleNextStep = () => {
        setFormError(''); 
        if (currentStep === 1) {
            if (!formDepartmentId || !formYear || !formSemesterType) {
                setFormError("Please select Department, Year, and Semester Type."); return;
            }
        }
        if (currentStep === 2) {
            const totalSubjects = Object.values(subjectCounts).reduce((sum, count) => sum + Number(count || 0), 0);
            if (totalSubjects === 0) {
                setFormError("Please specify the number of subjects for at least one type."); return;
            }
            const newElectiveOptions = { DLO: [], ILOT: [], MajorMinor: [] };
            Object.keys(subjectCounts).forEach(type => {
                if (['DLO', 'ILOT', 'MajorMinor'].includes(type)) {
                    newElectiveOptions[type] = Array(Number(subjectCounts[type] || 0)).fill(1);
                }
            });
            setElectiveOptionsCounts(newElectiveOptions);
            const hasElectives = ['DLO', 'ILOT', 'MajorMinor'].some(type => Number(subjectCounts[type] || 0) > 0);
            if (!hasElectives) {
                initializeDetailedSubjectsData(); // Initialize with courseGroup
                setCurrentStep(4); return;
            }
        }
        if (currentStep === 3) {
            let valid = true;
             Object.keys(electiveOptionsCounts).forEach(type => {
                electiveOptionsCounts[type].forEach((count, index) => {
                    if (Number(count || 0) <= 0) {
                        setFormError(`Number of options for ${type}${index + 1} must be at least 1.`); valid = false;
                    }
                });
            });
            if (!valid) return;
            initializeDetailedSubjectsData(); // Initialize with courseGroup
        }
        setCurrentStep(prev => prev + 1);
    };

    const handlePrevStep = () => {
        setFormError('');
        if (currentStep === 4) {
             const hasElectives = ['DLO', 'ILOT', 'MajorMinor'].some(type => Number(subjectCounts[type] || 0) > 0);
             if (!hasElectives) { setCurrentStep(2); return; }
        }
        setCurrentStep(prev => prev - 1);
    };

    const handleSubjectCountChange = (type, value) => {
        const count = Math.max(0, parseInt(value) || 0);
        setSubjectCounts(prev => ({ ...prev, [type]: count }));
    };

    const handleElectiveOptionCountChange = (type, groupIndex, value) => {
        const count = Math.max(1, parseInt(value) || 1);
        setElectiveOptionsCounts(prev => {
            const updatedCounts = [...prev[type]];
            updatedCounts[groupIndex] = count;
            return { ...prev, [type]: updatedCounts };
        });
    };
    
    const handleSubjectDetailChange = (groupIndex, field, value, optionIndex = null) => {
        setDetailedSubjectsData(prevData => {
            const newData = JSON.parse(JSON.stringify(prevData)); 
            const targetItem = optionIndex !== null ? newData[groupIndex].options[optionIndex] : newData[groupIndex];
            targetItem[field] = value;
            if (field === 'practicalHours') {
                targetItem.practicalHours = Math.max(0, parseInt(value) || 0); 
                if (Number(targetItem.practicalHours) === 0) targetItem.labRequirements = '';
            }
            if (field === 'theoryHours') targetItem.theoryHours = Math.max(0, parseInt(value) || 0);
            return newData;
        });
    };

    // MODIFIED: handleSaveAllSubjects to include courseGroup
    const handleSaveAllSubjects = async () => {
        setFormError(''); setSuccessMessage(''); 
        const token = localStorage.getItem('authToken');
        if (!token || !isAdmin) { setFormError('Unauthorized action.'); return; }

        const subjectsToSave = [];
        detailedSubjectsData.forEach(item => {
            if (item.isElectiveGroup) {
                item.options.forEach(option => subjectsToSave.push({
                    code: option.code, name: option.name, departmentId: parseInt(option.departmentId),
                    year: option.year, semester: option.semester, subjectType: option.subjectType,
                    courseGroup: option.courseGroup, // Include courseGroup
                    courseCategory: option.courseCategory, theoryHours: parseInt(option.theoryHours) || 0,
                    practicalHours: parseInt(option.practicalHours) || 0,
                    labRequirements: (option.practicalHours > 0 && option.labRequirements) ? option.labRequirements.split(',').map(s => s.trim()).filter(s => s) : [],
                }));
            } else { // Common subjects
                subjectsToSave.push({
                    code: item.code, name: item.name, departmentId: parseInt(item.departmentId),
                    year: item.year, semester: item.semester, subjectType: item.subjectType,
                    courseGroup: item.courseGroup, // Include courseGroup
                    courseCategory: item.courseCategory, theoryHours: parseInt(item.theoryHours) || 0,
                    practicalHours: parseInt(item.practicalHours) || 0,
                    labRequirements: (item.practicalHours > 0 && item.labRequirements) ? item.labRequirements.split(',').map(s => s.trim()).filter(s => s) : [],
                });
            }
        });
        
        // ... (validation logic remains largely the same, courseGroup is auto-assigned so less to validate here for it)
        const validationErrors = [];
        subjectsToSave.forEach((sub, index) => {
            if (!sub.code || !sub.name || !sub.departmentId || !sub.year || !sub.semester || !sub.subjectType) {
                validationErrors.push(`Subject ${index + 1} (Name: ${sub.name || sub.code || 'Unnamed'}): Missing required fields.`);
            }
            // Course group should always be present due to frontend logic
            if (!sub.courseGroup && sub.subjectType !== 'Common') { // Common subjects will have "Common"
                 validationErrors.push(`Subject ${index + 1} (Code: ${sub.code}): Course Group is missing for non-Common subject.`);
            }
        });

        if (validationErrors.length > 0) {
            setFormError(`Validation Failed:\n${validationErrors.join('\n')}`);
            return; 
        }


        setIsLoading(true); 
        try {
            const response = await axios.post(`${API_BASE_URL}/subjects/batch-create`, { subjects: subjectsToSave }, { headers: { Authorization: `Bearer ${token}` } });
            setSuccessMessage(response.data.message || `${response.data.createdSubjects?.length || 0} subjects created successfully!`); 
            setFormError(''); 
            setShowAddSubjectMode(false); 
            setCurrentStep(1); 
            resetAllFormData();
            fetchExistingSubjects(viewFilters, sortConfig);
        } catch (err) {
            console.error("Save All Subjects Error:", err.response || err);
            let errorMessage = "Failed to save subjects."; 
            if (err.response) {
                errorMessage = err.response.data?.message || errorMessage;
                if (err.response.data?.errors && Array.isArray(err.response.data.errors)) {
                    const specificErrors = err.response.data.errors.map(
                        e => `Subject (Code: ${e.code || (subjectsToSave[e.index] ? subjectsToSave[e.index].code : 'N/A') || 'N/A'}): ${e.message}`
                    ).join('\n');
                    errorMessage += `\nDetails:\n${specificErrors}`;
                }
            } else if (err.request) {
                errorMessage = "No response from server.";
            } else {
                errorMessage = err.message || "An unexpected error occurred.";
            }
            setFormError(errorMessage); 
            setSuccessMessage(''); 
        } finally {
            setIsLoading(false);
        }
    };

    // MODIFIED: handleShowEditModal to include courseGroup
    const handleShowEditModal = (subject) => {
        setEditingSubject(subject);
        const semType = subject.semester % 2 === 0 ? 'even' : 'odd';
        setEditFormData({
            id: subject.id, code: subject.code, name: subject.name,
            departmentId: subject.departmentId, year: subject.year,
            semesterType: semType, 
            subjectType: subject.subjectType, 
            courseGroup: subject.courseGroup || '', // Add courseGroup
            courseCategory: subject.courseCategory || '',
            theoryHours: subject.theoryHours, practicalHours: subject.practicalHours,
            labRequirements: subject.labRequirements?.join(', ') || '',
        });
        setEditFormError('');
        setShowEditModal(true);
    };

    const handleEditFormChange = (e) => {
        const { name, value } = e.target;
        setEditFormData(prev => ({ ...prev, [name]: value }));
    };

    // MODIFIED: handleUpdateSubject to include courseGroup (though it's mostly read-only from creation)
    const handleUpdateSubject = async (e) => {
        e.preventDefault();
        setEditFormError(''); setSuccessMessage('');
        if (!editingSubject) return;

        const token = localStorage.getItem('authToken');
        if (!token || !isAdmin) { setEditFormError('Unauthorized action.'); return; }
        if (!editFormData.code || !editFormData.name || !editFormData.departmentId || !editFormData.year || !editFormData.semesterType || !editFormData.subjectType) {
            setEditFormError("All fields marked with * are required."); return;
        }
        const payload = {
            ...editFormData,
            courseGroup: editFormData.courseGroup, // Include courseGroup
            labRequirements: (editFormData.practicalHours > 0 && editFormData.labRequirements) 
                ? editFormData.labRequirements.split(',').map(s => s.trim()).filter(s => s) 
                : [],
        };
        delete payload.id; 

        setIsUpdatingSubject(true);
        try {
            await axios.put(`${API_BASE_URL}/subjects/${editingSubject.id}`, payload, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSuccessMessage(`Subject ${editingSubject.code} updated successfully!`);
            setShowEditModal(false); setEditingSubject(null);
            fetchExistingSubjects(viewFilters, sortConfig);
        } catch (err) {
            console.error("Update Subject Error:", err.response);
            setEditFormError(err.response?.data?.message || `Failed to update subject ${editingSubject.code}.`);
        } finally {
            setIsUpdatingSubject(false);
        }
    };

    const handleDeleteSubject = async (subjectId, subjectCode) => {
        if (!window.confirm(`Are you sure you want to delete subject ${subjectCode}?`)) return;
        setError(''); setSuccessMessage('');
        const token = localStorage.getItem('authToken');
        if (!token || !isAdmin) { setError('Unauthorized action.'); return; }
        setIsLoading(true); 
        try {
            await axios.delete(`${API_BASE_URL}/subjects/${subjectId}`, { headers: { Authorization: `Bearer ${token}` } });
            setSuccessMessage(`Subject ${subjectCode} deleted successfully.`);
            fetchExistingSubjects(viewFilters, sortConfig);
        } catch (err) {
            setError(err.response?.data?.message || `Failed to delete subject ${subjectCode}.`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUploadChange = (event) => {
        setFileToUpload(event.target.files[0]);
        setUploadFileError(''); setUploadFileSuccess('');
    };

    const handleImportSubjects = async () => {
        if (!fileToUpload) { setUploadFileError("Please select a file."); return; }
        const token = localStorage.getItem('authToken');
        if (!token || !isAdmin) { setUploadFileError('Unauthorized action.'); return; }
        const formData = new FormData();
        formData.append('file', fileToUpload);
        setIsUploadingFile(true); setUploadFileError(''); setUploadFileSuccess('');
        try {
            const response = await axios.post(`${API_BASE_URL}/subjects/upload`, formData, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'multipart/form-data', },
            });
            setUploadFileSuccess(response.data.message || `${response.data.createdCount || 0} subjects imported.`);
            if (response.data.errors && response.data.errors.length > 0) {
                const errorDetails = response.data.errors.map(e => `Row ${e.row} (Code: ${e.subjectCode}): ${e.message}`).join('\n');
                setUploadFileError(`Import completed with some errors:\n${errorDetails}`);
            }
            fetchExistingSubjects(viewFilters, sortConfig);
        } catch (err) {
            setUploadFileError(err.response?.data?.message || "Failed to import subjects.");
        } finally {
            setIsUploadingFile(false); setFileToUpload(null);
            if (fileInputRef.current) fileInputRef.current.value = ""; 
        }
    };

    const handleDownloadExcel = () => {
        if (subjects.length === 0) { alert("No data to export."); return; }
        const dataToExport = subjects.map(subject => ({
            'Code': subject.code, 'Name': subject.name,
            'Department': subject.department?.name || 'N/A',
            'Year': subject.year, 'Semester': subject.semester,
            'Type': SUBJECT_TYPE_DISPLAY_MAP[subject.subjectType] || subject.subjectType,
            'Course Group': subject.courseGroup || '-', // Added Course Group
            'Course Category': subject.courseCategory || '-',
            'Theory Hours': subject.theoryHours, 'Practical Hours': subject.practicalHours,
            'Lab Requirements': subject.labRequirements?.join(', ') || '-',
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Subjects");
        XLSX.writeFile(workbook, `Subjects_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
        setSuccessMessage("Data exported to Excel successfully."); 
    };

    const inputStyle = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 disabled:opacity-70";
    const labelStyle = "block text-sm font-medium text-gray-700 dark:text-gray-300";
    const buttonPrimaryStyle = "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50";
    const buttonSecondaryStyle = "px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100 rounded-md text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 disabled:opacity-50";
    const tableHeaderStyle = "px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700";
    const tableCellStyle = "px-3 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300";

    // MODIFIED: renderSubjectFormFields to display courseGroup
    const renderSubjectFormFields = (subjectData, groupIndex, optionIndex = null) => { 
        const idPrefix = optionIndex !== null ? `group${groupIndex}_option${optionIndex}` : `group${groupIndex}`;
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                <div>
                    <label htmlFor={`${idPrefix}_courseGroup`} className={labelStyle}>Course Group</label>
                    <input type="text" id={`${idPrefix}_courseGroup`} value={subjectData.courseGroup || ''} readOnly className={`${inputStyle} bg-gray-100 dark:bg-gray-700/50`} />
                </div>
                <div>
                    <label htmlFor={`${idPrefix}_code`} className={labelStyle}>Code*</label>
                    <input type="text" id={`${idPrefix}_code`} value={subjectData.code} onChange={(e) => handleSubjectDetailChange(groupIndex, 'code', e.target.value, optionIndex)} required className={inputStyle} />
                </div>
                <div>
                    <label htmlFor={`${idPrefix}_name`} className={labelStyle}>Name*</label>
                    <input type="text" id={`${idPrefix}_name`} value={subjectData.name} onChange={(e) => handleSubjectDetailChange(groupIndex, 'name', e.target.value, optionIndex)} required className={inputStyle} />
                </div>
                <div>
                    <label htmlFor={`${idPrefix}_courseCategory`} className={labelStyle}>Course Category</label>
                    <input type="text" id={`${idPrefix}_courseCategory`} value={subjectData.courseCategory} onChange={(e) => handleSubjectDetailChange(groupIndex, 'courseCategory', e.target.value, optionIndex)} placeholder="e.g., PCC, DLO1-Option1" className={inputStyle} />
                </div>
                <div>
                    <label htmlFor={`${idPrefix}_theoryHours`} className={labelStyle}>Theory Hours (weekly)</label>
                    <input type="number" id={`${idPrefix}_theoryHours`} value={subjectData.theoryHours} onChange={(e) => handleSubjectDetailChange(groupIndex, 'theoryHours', e.target.value, optionIndex)} min="0" className={inputStyle} />
                </div>
                <div>
                    <label htmlFor={`${idPrefix}_practicalHours`} className={labelStyle}>Practical Hours (weekly)</label>
                    <input type="number" id={`${idPrefix}_practicalHours`} value={subjectData.practicalHours} onChange={(e) => handleSubjectDetailChange(groupIndex, 'practicalHours', e.target.value, optionIndex)} min="0" className={inputStyle} />
                </div>
                <div className="md:col-span-full lg:col-span-1"> {/* Allow lab reqs to span if needed */}
                    <label htmlFor={`${idPrefix}_labRequirements`} className={labelStyle}>Lab Requirements (comma-separated)</label>
                    <input
                        type="text"
                        id={`${idPrefix}_labRequirements`}
                        value={subjectData.labRequirements}
                        onChange={(e) => handleSubjectDetailChange(groupIndex, 'labRequirements', e.target.value, optionIndex)}
                        className={inputStyle}
                        disabled={Number(subjectData.practicalHours || 0) === 0}
                        placeholder={Number(subjectData.practicalHours || 0) === 0 ? "N/A (No practical hours)" : "e.g., Computers"}
                    />
                </div>
            </div>
        );
    };
    
    // renderStepContent remains largely the same, but initializeDetailedSubjectsData (called within it) is now aware of courseGroup
    const renderStepContent = () => { 
        switch (currentStep) {
            case 1: return ( /* ... existing Step 1 JSX ... */ 
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="formDepartmentId" className={labelStyle}>Department*</label>
                            <select name="formDepartmentId" id="formDepartmentId" value={formDepartmentId} onChange={(e) => setFormDepartmentId(e.target.value)} required className={inputStyle} disabled={isLoadingDepartments || !!globalSelectedDepartment}>
                                <option value="">-- Select Department --</option>
                                {departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                            </select>
                            {!!globalSelectedDepartment && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Using globally selected: {globalSelectedDepartment.name}</p>}
                        </div>
                        <div>
                            <label htmlFor="formYear" className={labelStyle}>Year*</label>
                            <select name="formYear" id="formYear" value={formYear} onChange={(e) => setFormYear(e.target.value)} required className={inputStyle}>
                                <option value="">-- Select Year --</option>
                                {YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="formSemesterType" className={labelStyle}>Semester Type*</label>
                            <select name="formSemesterType" id="formSemesterType" value={formSemesterType} onChange={(e) => setFormSemesterType(e.target.value)} required className={inputStyle}>
                                <option value="">-- Select Semester Type --</option>
                                {SEMESTER_TYPES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                            </select>
                        </div>
                         {calculatedSemesterForForm !== null && (
                            <div>
                                <label className={labelStyle}>Resulting Semester</label>
                                <input type="text" value={calculatedSemesterForForm} readOnly className={`${inputStyle} bg-gray-100 dark:bg-gray-700/50`} />
                            </div>
                        )}
                    </div>
            );
            case 2: return ( /* ... existing Step 2 JSX ... */ 
                    <div className="space-y-4">
                        {SUBJECT_TYPES_CONFIG.map(st => (
                            <div key={st.value}>
                                <label htmlFor={`count_${st.value}`} className={labelStyle}>{st.label}</label>
                                <input
                                    type="number"
                                    id={`count_${st.value}`}
                                    name={`count_${st.value}`}
                                    value={subjectCounts[st.value]}
                                    onChange={(e) => handleSubjectCountChange(st.value, e.target.value)}
                                    min="0"
                                    className={inputStyle}
                                />
                            </div>
                        ))}
                    </div>
            );
            case 3: /* ... existing Step 3 JSX ... */ 
                const electiveTypesWithCounts = Object.entries(subjectCounts)
                    .filter(([type, count]) => (['DLO', 'ILOT', 'MajorMinor'].includes(type)) && Number(count || 0) > 0);
                if (electiveTypesWithCounts.length === 0) {
                    return <p>No elective subjects specified. Click "Next" to detail Common subjects or "Back" to adjust counts.</p>;
                }
                return (
                    <div className="space-y-6">
                        {electiveTypesWithCounts.map(([type, count]) => (
                            <div key={type} className="p-3 border dark:border-gray-600 rounded-md">
                                <h3 className="text-md font-semibold mb-2 text-gray-700 dark:text-gray-200">Number of Options for {type} Groups</h3>
                                {Array.from({ length: Number(count) }).map((_, i) => (
                                    <div key={`${type}_group_${i}`} className="mb-2">
                                        <label htmlFor={`options_${type}_${i}`} className={`${labelStyle} text-sm`}>
                                            Options for {type}{i + 1} (Course Group: {type}{i+1})
                                        </label>
                                        <input
                                            type="number"
                                            id={`options_${type}_${i}`}
                                            value={electiveOptionsCounts[type][i] || 1}
                                            onChange={(e) => handleElectiveOptionCountChange(type, i, e.target.value)}
                                            min="1"
                                            className={`${inputStyle} w-full sm:w-1/2`}
                                        />
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                );
            case 4: /* ... existing Step 4 JSX (uses renderSubjectFormFields which is now updated) ... */ 
                if (detailedSubjectsData.length === 0) {
                    return <p className="text-center text-gray-500 dark:text-gray-400">No subjects configured. Go back to define counts.</p>;
                }
                return (
                    <div className="space-y-6">
                        {detailedSubjectsData.map((subjectItem, groupIndex) => (
                            <div key={subjectItem.id} className="p-4 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                                <h3 className="text-lg font-semibold mb-3 text-indigo-600 dark:text-indigo-400">{subjectItem.uiGroupName}</h3>
                                {subjectItem.isElectiveGroup ? (
                                    subjectItem.options.map((option, optionIndex) => (
                                        <div key={option.id} className="mb-4 p-3 border dark:border-gray-500 rounded-md bg-white dark:bg-gray-700/50">
                                            <h4 className="text-md font-medium mb-2 text-gray-700 dark:text-gray-200">Option {optionIndex + 1} (for Course Group: {option.courseGroup})</h4>
                                            {renderSubjectFormFields(option, groupIndex, optionIndex)}
                                        </div>
                                    ))
                                ) : (
                                    renderSubjectFormFields(subjectItem, groupIndex)
                                )}
                            </div>
                        ))}
                    </div>
                );
            default: return <p>Something went wrong.</p>;
        }
    };


    return (
        <div className="container mx-auto p-4 md:p-6">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">
                    Subject Management {globalSelectedDepartment ? `(${globalSelectedDepartment.name})` : ''}
                </h1>
                {isAdmin && (
                    <button 
                        onClick={() => { setShowAddSubjectMode(!showAddSubjectMode); if (!showAddSubjectMode) { setCurrentStep(1); resetAllFormData(); } setError(''); setSuccessMessage(''); setFormError(''); setUploadFileError(''); setUploadFileSuccess(''); }} 
                        className={showAddSubjectMode ? buttonSecondaryStyle : `${buttonPrimaryStyle} bg-green-600 hover:bg-green-700`}
                    >
                        {showAddSubjectMode ? 'View Existing Subjects' : 'Add New Subjects (Multi-Step)'}
                    </button>
                )}
            </div>

            {error && !showAddSubjectMode && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-300 p-4 mb-4 rounded-md" role="alert">{error}</div>}
            {successMessage && !formError && !uploadFileSuccess && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-300 p-4 mb-4 rounded-md" role="alert">{successMessage}</div>}

            {isAdmin && showAddSubjectMode && (
                <div className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700">
                    <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
                        Add Subjects - Step {currentStep} of 4
                        {currentStep === 1 && ": Initial Setup"} {currentStep === 2 && ": Subject Counts"}
                        {currentStep === 3 && ": Elective Options"} {currentStep === 4 && ": Subject Details"}
                    </h2>
                    {formError && <div className="bg-red-100 text-red-700 p-3 mb-3 rounded-md text-sm whitespace-pre-wrap" role="alert">{formError}</div>}
                    {renderStepContent()}
                    <div className="mt-6 flex justify-between items-center">
                        <div>{currentStep > 1 && (<button type="button" onClick={handlePrevStep} className={buttonSecondaryStyle} disabled={isLoading}>Back</button>)}</div>
                        <div className="flex items-center space-x-3">
                             {currentStep > 1 && currentStep < 4 && (<button type="button" onClick={() => { setCurrentStep(1); resetAllFormData(); }} className={`${buttonSecondaryStyle} text-xs border-red-500 text-red-600 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/50`} disabled={isLoading}>Reset Form</button>)}
                            {currentStep < 4 && (<button type="button" onClick={handleNextStep} className={buttonPrimaryStyle} disabled={isLoading}>Next</button>)}
                            {currentStep === 4 && (<button type="button" onClick={handleSaveAllSubjects} className={`${buttonPrimaryStyle} bg-green-600 hover:bg-green-700`} disabled={isLoading}>{isLoading ? 'Saving...' : 'Save All Subjects'}</button>)}
                        </div>
                    </div>
                </div>
            )}
            
            {!showAddSubjectMode && (
                <>
                    {isAdmin && ( /* File Upload and Export Section */
                        <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-800/50 rounded-lg shadow border dark:border-gray-600">
                            <h3 className="text-lg font-medium mb-3 text-gray-700 dark:text-gray-200">Data Operations</h3>
                            <div className="flex flex-col sm:flex-row gap-4 items-start">
                                <div className="flex-1 w-full">
                                    <label htmlFor="subject-file-upload" className={labelStyle}>Import Subjects (CSV/Excel)</label>
                                    <div className="flex items-center mt-1">
                                        <input type="file" id="subject-file-upload" ref={fileInputRef} accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={handleFileUploadChange} className={`${inputStyle} p-1.5 flex-grow text-sm file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-800 file:text-indigo-700 dark:file:text-indigo-200 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-700`} disabled={isUploadingFile}/>
                                        <button onClick={handleImportSubjects} className={`${buttonPrimaryStyle} ml-2 bg-purple-600 hover:bg-purple-700 text-xs sm:text-sm`} disabled={isUploadingFile || !fileToUpload}>{isUploadingFile ? 'Uploading...' : 'Upload File'}</button>
                                    </div>
                                    {uploadFileError && <p className="text-red-500 text-xs mt-1 whitespace-pre-wrap">{uploadFileError}</p>}
                                    {uploadFileSuccess && <p className="text-green-500 text-xs mt-1">{uploadFileSuccess}</p>}
                                </div>
                                <div className="flex-1 w-full sm:w-auto sm:text-right mt-2 sm:mt-0">
                                     <label className={`${labelStyle} sm:invisible`}>Export Data</label> 
                                    <button onClick={handleDownloadExcel} className={`${buttonPrimaryStyle} mt-1 bg-teal-600 hover:bg-teal-700 w-full sm:w-auto text-xs sm:text-sm`} disabled={isLoading || subjects.length === 0}>Download as Excel</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* View Filters */}
                    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg shadow border dark:border-gray-700">
                        <h3 className="text-lg font-medium mb-3 text-gray-700 dark:text-gray-200">Filter Subjects</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {!globalSelectedDepartment && (<div><label htmlFor="viewFilterDepartmentId" className={labelStyle}>Department</label><select name="departmentId" id="viewFilterDepartmentId" value={viewFilters.departmentId} onChange={handleViewFilterChange} className={inputStyle} disabled={isLoadingDepartments}><option value="">All Departments</option>{departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}</select></div>)}
                            <div><label htmlFor="viewFilterYear" className={labelStyle}>Year</label><select name="year" id="viewFilterYear" value={viewFilters.year} onChange={handleViewFilterChange} className={inputStyle}><option value="">All Years</option>{YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}</select></div>
                            <div><label htmlFor="viewFilterSemesterType" className={labelStyle}>Semester Type</label><select name="semesterTypeForFilter" id="viewFilterSemesterType" value={viewFilters.semesterTypeForFilter || ''} onChange={handleViewFilterSemesterTypeChange} className={inputStyle}><option value="">All Sem Types</option>{SEMESTER_TYPES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}</select></div>
                            <div><label htmlFor="viewFilterSemesterDirect" className={labelStyle}>Or Specific Semester</label><input type="number" name="semester" id="viewFilterSemesterDirect" placeholder="e.g., 3" value={viewFilters.semester} onChange={handleViewFilterChange} className={inputStyle} min="1" max="8" /></div>
                            <div><label htmlFor="viewFilterSubjectType" className={labelStyle}>Subject Type</label><select name="subjectType" id="viewFilterSubjectType" value={viewFilters.subjectType} onChange={handleViewFilterChange} className={inputStyle}><option value="">All Types</option>{SUBJECT_TYPES_CONFIG.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}</select></div>
                            {/* Added Course Group Filter */}
                            <div><label htmlFor="viewFilterCourseGroup" className={labelStyle}>Course Group</label><input type="text" name="courseGroup" id="viewFilterCourseGroup" value={viewFilters.courseGroup} onChange={handleViewFilterChange} placeholder="e.g., Common, DLO1" className={inputStyle} /></div>
                            <div><label htmlFor="viewFilterCourseCategory" className={labelStyle}>Course Category</label><input type="text" name="courseCategory" id="viewFilterCourseCategory" value={viewFilters.courseCategory} onChange={handleViewFilterChange} placeholder="e.g., PCC, DLO1-AI" className={inputStyle} /></div>
                            <div><label htmlFor="viewFilterCode" className={labelStyle}>Code</label><input type="text" name="code" id="viewFilterCode" value={viewFilters.code} onChange={handleViewFilterChange} placeholder="Filter by code" className={inputStyle} /></div>
                            <div><label htmlFor="viewFilterName" className={labelStyle}>Name</label><input type="text" name="name" id="viewFilterName" value={viewFilters.name} onChange={handleViewFilterChange} placeholder="Filter by name" className={inputStyle} /></div>
                        </div>
                        <button onClick={() => setViewFilters({ departmentId: globalSelectedDepartment?.id || '', year: '', semester: '', subjectType: '', courseCategory: '', code: '', name: '', courseGroup: '', semesterTypeForFilter: ''})} className={`${buttonSecondaryStyle} mt-4 text-xs`}>Reset View Filters</button>
                    </div>

                    {/* View Subjects Table */}
                    {isLoading && <p className="text-center py-4">Loading subjects...</p>}
                    {!isLoading && subjects.length === 0 && (<p className="text-center py-4 text-gray-500 dark:text-gray-400">No subjects found.</p>)}
                    {!isLoading && subjects.length > 0 && (
                        <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow-lg rounded-lg border dark:border-gray-700">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-700/70">
                                    <tr>
                                        <th onClick={() => requestSort('code')} className={tableHeaderStyle}>Code{getSortIndicator('code')}</th>
                                        <th onClick={() => requestSort('name')} className={tableHeaderStyle}>Name{getSortIndicator('name')}</th>
                                        <th className={tableHeaderStyle}>Dept</th>
                                        <th onClick={() => requestSort('year')} className={tableHeaderStyle}>Yr/Sem{getSortIndicator('year')}{getSortIndicator('semester')}</th>
                                        <th onClick={() => requestSort('subjectType')} className={tableHeaderStyle}>Type{getSortIndicator('subjectType')}</th>
                                        {/* Added Course Group Column */}
                                        <th onClick={() => requestSort('courseGroup')} className={tableHeaderStyle}>Course Group{getSortIndicator('courseGroup')}</th>
                                        <th onClick={() => requestSort('courseCategory')} className={tableHeaderStyle}>Category{getSortIndicator('courseCategory')}</th>
                                        <th className={`${tableHeaderStyle} text-center`}>TH</th>
                                        <th className={`${tableHeaderStyle} text-center`}>PH</th>
                                        <th className={tableHeaderStyle}>Lab Reqs.</th>
                                        {isAdmin && <th className={tableHeaderStyle}>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {subjects.map(subject => (
                                        <tr key={subject.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className={`${tableCellStyle} font-medium`}>{subject.code}</td>
                                            <td className={tableCellStyle}>{subject.name}</td>
                                            <td className={tableCellStyle}>{subject.department?.name || 'N/A'}</td>
                                            <td className={tableCellStyle}>{`Y${subject.year}/S${subject.semester}`}</td>
                                            <td className={tableCellStyle}>{SUBJECT_TYPE_DISPLAY_MAP[subject.subjectType] || subject.subjectType}</td>
                                            {/* Display Course Group */}
                                            <td className={tableCellStyle}>{subject.courseGroup || '-'}</td>
                                            <td className={tableCellStyle}>{subject.courseCategory || '-'}</td>
                                            <td className={`${tableCellStyle} text-center`}>{subject.theoryHours}</td>
                                            <td className={`${tableCellStyle} text-center`}>{subject.practicalHours}</td>
                                            <td className={`${tableCellStyle} max-w-xs truncate`}>{subject.labRequirements?.join(', ') || '-'}</td>
                                            {isAdmin && (
                                                <td className={`${tableCellStyle} space-x-2 whitespace-nowrap`}>
                                                    <button onClick={() => handleShowEditModal(subject)} className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 text-xs font-medium">Edit</button>
                                                    <button onClick={() => handleDeleteSubject(subject.id, subject.code)} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs font-medium">Delete</button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* Edit Subject Modal */}
            {showEditModal && editingSubject && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
                    <div className="relative bg-white dark:bg-gray-800 w-full max-w-2xl p-6 rounded-lg shadow-xl">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Edit Subject: {editingSubject.code}</h3>
                            <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>
                        {editFormError && <div className="bg-red-100 text-red-700 p-3 mb-3 rounded-md text-sm whitespace-pre-wrap">{editFormError}</div>}
                        <form onSubmit={handleUpdateSubject}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label htmlFor="edit_code" className={labelStyle}>Code*</label><input type="text" name="code" id="edit_code" value={editFormData.code || ''} onChange={handleEditFormChange} required className={inputStyle} /></div>
                                <div><label htmlFor="edit_name" className={labelStyle}>Name*</label><input type="text" name="name" id="edit_name" value={editFormData.name || ''} onChange={handleEditFormChange} required className={inputStyle} /></div>
                                <div><label htmlFor="edit_departmentId" className={labelStyle}>Department*</label><select name="departmentId" id="edit_departmentId" value={editFormData.departmentId || ''} onChange={handleEditFormChange} required className={inputStyle} disabled={isLoadingDepartments}><option value="">-- Select --</option>{departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}</select></div>
                                <div><label htmlFor="edit_year" className={labelStyle}>Year*</label><select name="year" id="edit_year" value={editFormData.year || ''} onChange={handleEditFormChange} required className={inputStyle}><option value="">-- Select --</option>{YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}</select></div>
                                <div><label htmlFor="edit_semesterType" className={labelStyle}>Semester Type*</label><select name="semesterType" id="edit_semesterType" value={editFormData.semesterType || ''} onChange={handleEditFormChange} required className={inputStyle}><option value="">-- Select --</option>{SEMESTER_TYPES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}</select></div>
                                <div><label className={labelStyle}>Resulting Semester</label><input type="text" value={ (editFormData.year && editFormData.semesterType) ? (parseInt(editFormData.year) * 2 - (editFormData.semesterType === 'odd' ? 1 : 0)) : 'N/A'} readOnly className={`${inputStyle} bg-gray-100 dark:bg-gray-700/50`} /></div>
                                <div><label htmlFor="edit_subjectType" className={labelStyle}>Subject Type*</label><select name="subjectType" id="edit_subjectType" value={editFormData.subjectType || ''} onChange={handleEditFormChange} required className={inputStyle}><option value="">-- Select --</option>{SUBJECT_TYPES_CONFIG.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}</select></div>
                                {/* Display Course Group (read-only in edit form) */}
                                <div><label htmlFor="edit_courseGroup" className={labelStyle}>Course Group</label><input type="text" name="courseGroup" id="edit_courseGroup" value={editFormData.courseGroup || ''} onChange={handleEditFormChange} className={`${inputStyle} bg-gray-100 dark:bg-gray-700/50`} placeholder="e.g. Common, DLO1" /></div>
                                <div><label htmlFor="edit_courseCategory" className={labelStyle}>Course Category</label><input type="text" name="courseCategory" id="edit_courseCategory" value={editFormData.courseCategory || ''} onChange={handleEditFormChange} placeholder="e.g., PCC" className={inputStyle} /></div>
                                <div><label htmlFor="edit_theoryHours" className={labelStyle}>Theory Hours</label><input type="number" name="theoryHours" id="edit_theoryHours" value={editFormData.theoryHours || 0} onChange={handleEditFormChange} min="0" className={inputStyle} /></div>
                                <div><label htmlFor="edit_practicalHours" className={labelStyle}>Practical Hours</label><input type="number" name="practicalHours" id="edit_practicalHours" value={editFormData.practicalHours || 0} onChange={handleEditFormChange} min="0" className={inputStyle} /></div>
                                <div className="md:col-span-2"><label htmlFor="edit_labRequirements" className={labelStyle}>Lab Requirements</label><input type="text" name="labRequirements" id="edit_labRequirements" value={editFormData.labRequirements || ''} onChange={handleEditFormChange} className={inputStyle} disabled={Number(editFormData.practicalHours || 0) === 0} placeholder={Number(editFormData.practicalHours || 0) === 0 ? "N/A" : "e.g., Computers"}/></div>
                            </div>
                            <div className="mt-6 flex justify-end space-x-3">
                                <button type="button" onClick={() => setShowEditModal(false)} className={buttonSecondaryStyle} disabled={isUpdatingSubject}>Cancel</button>
                                <button type="submit" className={buttonPrimaryStyle} disabled={isUpdatingSubject}>{isUpdatingSubject ? 'Updating...' : 'Update Subject'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default SubjectManagementPage;
