// File: client/src/pages/SyllabusManagementPage.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../App';
import { useDepartment } from '../context/DepartmentContext';

const API_BASE_URL = 'http://localhost:5001/api';
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
const SYLLABUS_TYPES_ENUM = ['Theory', 'Lab']; // Matches Prisma SyllabusType
const SUBJECT_TYPES_ENUM = ['Common', 'DLO', 'ILOT', 'MajorMinor']; // Matches Prisma SubjectType

function SyllabusManagementPage() {
    const { userInfo } = useAuth();
    const { departments, isLoadingDepartments, fetchDepartments: fetchContextDepartments, selectedDepartment: globalSelectedDepartment } = useDepartment();

    const [filters, setFilters] = useState({
        departmentId: '',
        year: '',
        semesterType: '',
        subjectType: '', // New filter for subject type
        sortBy: 'code', // Default sort key
        sortOrder: 'asc', // Default sort order
    });
    const [subjectsForSelection, setSubjectsForSelection] = useState([]);
    const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);
    const [currentFileUploads, setCurrentFileUploads] = useState({}); 
    const [isUploading, setIsUploading] = useState({}); 
    const [uploadErrors, setUploadErrors] = useState({}); 
    const [uploadSuccess, setUploadSuccess] = useState({}); 

    const [generalError, setGeneralError] = useState('');
    const [generalSuccess, setGeneralSuccess] = useState('');

    const isAdminOrFaculty = useMemo(() => userInfo?.role === 'Admin' || userInfo?.role === 'Faculty', [userInfo]);

    useEffect(() => {
        if (globalSelectedDepartment) {
            setFilters(prev => ({ ...prev, departmentId: globalSelectedDepartment.id, subjectType: '', sortBy: 'code', sortOrder: 'asc' }));
        } else {
            setFilters(prev => ({ ...prev, departmentId: '', subjectType: '', sortBy: 'code', sortOrder: 'asc' }));
        }
    }, [globalSelectedDepartment]);

    const fetchSubjectsForSyllabus = useCallback(async () => {
        if (!filters.departmentId || !filters.year || !filters.semesterType) {
            setSubjectsForSelection([]);
            return;
        }
        setIsLoadingSubjects(true);
        setGeneralError('');
        const token = localStorage.getItem('authToken');
        if (!token) {
            setGeneralError('Authentication required.');
            setIsLoadingSubjects(false);
            return;
        }
        try {
            const response = await axios.get(`${API_BASE_URL}/syllabus/subjects-for-selection`, {
                params: { // Pass all filters including new ones
                    departmentId: filters.departmentId,
                    year: filters.year,
                    semesterType: filters.semesterType,
                    subjectType: filters.subjectType, // Pass subjectType
                    sortBy: filters.sortBy,           // Pass sortBy
                    order: filters.sortOrder,         // Pass sortOrder
                },
                headers: { Authorization: `Bearer ${token}` },
            });
            setSubjectsForSelection(response.data || []);
        } catch (err) {
            console.error("Fetch Subjects for Syllabus Error:", err);
            setGeneralError(err.response?.data?.message || 'Failed to fetch subjects.');
            setSubjectsForSelection([]);
        } finally {
            setIsLoadingSubjects(false);
        }
    }, [filters]); // filters object now includes subjectType, sortBy, sortOrder

    useEffect(() => {
        if (departments.length === 0 && !isLoadingDepartments) {
            fetchContextDepartments();
        }
    }, [departments.length, isLoadingDepartments, fetchContextDepartments]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
        setSubjectsForSelection([]); 
        setGeneralSuccess('');
        setGeneralError('');
    };

    const handleFileSelect = (subjectId, type, event) => {
        const file = event.target.files[0];
        const key = `${subjectId}_${type}`;
        setCurrentFileUploads(prev => ({ ...prev, [key]: file }));
        setUploadErrors(prev => ({ ...prev, [key]: '' })); 
        setUploadSuccess(prev => ({ ...prev, [key]: '' }));
    };

    const handleUploadSyllabus = async (subjectId, subjectName, type) => {
        const key = `${subjectId}_${type}`;
        const fileToUpload = currentFileUploads[key];

        if (!fileToUpload) {
            setUploadErrors(prev => ({ ...prev, [key]: 'Please select a PDF file.' }));
            return;
        }
        setIsUploading(prev => ({ ...prev, [key]: true }));
        setUploadErrors(prev => ({ ...prev, [key]: '' }));
        setUploadSuccess(prev => ({ ...prev, [key]: '' }));
        setGeneralSuccess(''); setGeneralError('');

        const token = localStorage.getItem('authToken');
        const formData = new FormData();
        formData.append('syllabusFile', fileToUpload);
        formData.append('subjectId', subjectId);
        formData.append('type', type);

        try {
            const response = await axios.post(`${API_BASE_URL}/syllabus`, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data',
                },
            });
            setUploadSuccess(prev => ({ ...prev, [key]: response.data.message || 'Upload successful!' }));
            setCurrentFileUploads(prev => ({ ...prev, [key]: null })); 
            fetchSubjectsForSyllabus(); 
        } catch (err) {
            console.error(`Upload Syllabus Error for ${subjectName} (${type}):`, err);
            setUploadErrors(prev => ({ ...prev, [key]: err.response?.data?.message || `Failed to upload for ${type}.` }));
        } finally {
            setIsUploading(prev => ({ ...prev, [key]: false }));
        }
    };
    
    const handleDeleteSyllabus = async (syllabusId, subjectName, type) => {
        if (!window.confirm(`Are you sure you want to delete the ${type} syllabus for ${subjectName}?`)) return;
        
        setGeneralSuccess(''); setGeneralError('');
        const token = localStorage.getItem('authToken');
        if (!token) { setGeneralError('Authentication required.'); return; }

        try {
            await axios.delete(`${API_BASE_URL}/syllabus/${syllabusId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setGeneralSuccess(`Syllabus (${type}) for ${subjectName} deleted successfully!`);
            fetchSubjectsForSyllabus(); 
        } catch (err) {
            console.error("Delete Syllabus Error:", err);
            setGeneralError(err.response?.data?.message || 'Failed to delete syllabus.');
        }
    };

    const inputStyle = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 disabled:opacity-70";
    const labelStyle = "block text-sm font-medium text-gray-700 dark:text-gray-300";
    const buttonPrimaryStyle = "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-50";
    const buttonDangerStyle = "px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500 disabled:opacity-50";

    return (
        <div className="container mx-auto p-4 md:p-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white mb-6">
                Syllabus Management {globalSelectedDepartment ? `(${globalSelectedDepartment.name})` : ''}
            </h1>

            {generalError && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-300 p-4 mb-4 rounded-md" role="alert">{generalError}</div>}
            {generalSuccess && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-300 p-4 mb-4 rounded-md" role="alert">{generalSuccess}</div>}

            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg shadow border dark:border-gray-700">
                <h3 className="text-lg font-medium mb-3 text-gray-700 dark:text-gray-200">Select Criteria to Load Subjects</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <div>
                        <label htmlFor="departmentId" className={labelStyle}>Department*</label>
                        <select name="departmentId" id="departmentId" value={filters.departmentId} onChange={handleFilterChange} required className={inputStyle} disabled={isLoadingDepartments || !!globalSelectedDepartment}>
                            <option value="">-- Select Department --</option>
                            {departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                        </select>
                         {!!globalSelectedDepartment && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Department selected globally.</p>}
                    </div>
                    <div>
                        <label htmlFor="year" className={labelStyle}>Year*</label>
                        <select name="year" id="year" value={filters.year} onChange={handleFilterChange} required className={inputStyle}>
                            <option value="">-- Select Year --</option>
                            {YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="semesterType" className={labelStyle}>Semester Type*</label>
                        <select name="semesterType" id="semesterType" value={filters.semesterType} onChange={handleFilterChange} required className={inputStyle}>
                            <option value="">-- Select Semester Type --</option>
                            {SEMESTER_TYPES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                        </select>
                    </div>
                    {/* New Filter for Subject Type */}
                    <div>
                        <label htmlFor="subjectType" className={labelStyle}>Subject Type</label>
                        <select name="subjectType" id="subjectType" value={filters.subjectType} onChange={handleFilterChange} className={inputStyle}>
                            <option value="">All Subject Types</option>
                            {SUBJECT_TYPES_ENUM.map(st => <option key={st} value={st}>{st.replace(/([A-Z])/g, ' $1').trim()}</option>)}
                        </select>
                    </div>
                </div>
                {/* Sorting Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
                    <div>
                        <label htmlFor="sortBy" className={labelStyle}>Sort Subjects By</label>
                        <select name="sortBy" id="sortBy" value={filters.sortBy} onChange={handleFilterChange} className={inputStyle}>
                            <option value="code">Subject Code</option>
                            <option value="name">Subject Name</option>
                            <option value="subjectType">Subject Type</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="sortOrder" className={labelStyle}>Sort Order</label>
                        <select name="sortOrder" id="sortOrder" value={filters.sortOrder} onChange={handleFilterChange} className={inputStyle}>
                            <option value="asc">Ascending</option>
                            <option value="desc">Descending</option>
                        </select>
                    </div>
                </div>
                <div className="mt-4 flex justify-end">
                    <button onClick={fetchSubjectsForSyllabus} className={buttonPrimaryStyle} disabled={isLoadingSubjects || !filters.departmentId || !filters.year || !filters.semesterType}>
                        {isLoadingSubjects ? 'Loading Subjects...' : 'Load Subjects'}
                    </button>
                </div>
            </div>

            {isLoadingSubjects && <p className="text-center text-gray-600 dark:text-gray-400 py-5">Loading subjects...</p>}
            {!isLoadingSubjects && subjectsForSelection.length === 0 && filters.departmentId && filters.year && filters.semesterType && (
                <p className="text-center text-gray-500 dark:text-gray-400 py-5">No subjects found for the selected criteria.</p>
            )}

            {subjectsForSelection.length > 0 && (
                <div className="space-y-6">
                    {subjectsForSelection.map(subject => {
                        const theorySyllabus = subject.syllabi.find(s => s.type === 'Theory');
                        const labSyllabus = subject.syllabi.find(s => s.type === 'Lab');
                        const canHaveLabSyllabus = subject.practicalHours > 0;
                        const keyTheory = `${subject.id}_Theory`;
                        const keyLab = `${subject.id}_Lab`;

                        return (
                            <div key={subject.id} className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow border dark:border-gray-700">
                                <h4 className="text-md font-semibold text-gray-800 dark:text-white mb-1">{subject.code} - {subject.name}</h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Type: {subject.subjectType.replace(/([A-Z])/g, ' $1').trim()} | Practical Hours: {subject.practicalHours}</p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                                    {/* Theory Syllabus */}
                                    <div className="p-3 border dark:border-gray-600 rounded-md">
                                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Theory Syllabus</h5>
                                        {theorySyllabus ? (
                                            <div className="flex items-center justify-between">
                                                <a href={`${API_BASE_URL.replace('/api', '')}${theorySyllabus.filePath}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs underline truncate max-w-[150px] sm:max-w-xs" title={theorySyllabus.filePath}>
                                                    View Current (Ver. {theorySyllabus.year} Sem {theorySyllabus.semester})
                                                </a>
                                                {isAdminOrFaculty && <button onClick={() => handleDeleteSyllabus(theorySyllabus.id, subject.name, 'Theory')} className={buttonDangerStyle}>Delete</button>}
                                            </div>
                                        ) : <p className="text-xs text-gray-400 dark:text-gray-500">No theory syllabus uploaded.</p>}
                                        
                                        {isAdminOrFaculty && (
                                            <div className="mt-2">
                                                <input type="file" id={`file_${keyTheory}`} accept=".pdf" onChange={(e) => handleFileSelect(subject.id, 'Theory', e)} className="text-xs dark:text-gray-300 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 dark:file:bg-blue-800 file:text-blue-700 dark:file:text-blue-200 hover:file:bg-blue-100 dark:hover:file:bg-blue-700 w-full" />
                                                <button onClick={() => handleUploadSyllabus(subject.id, subject.name, 'Theory')} className={`${buttonPrimaryStyle} mt-1 w-full`} disabled={isUploading[keyTheory] || !currentFileUploads[keyTheory]}>
                                                    {isUploading[keyTheory] ? 'Uploading...' : (theorySyllabus ? 'Replace Theory' : 'Upload Theory')}
                                                </button>
                                                {uploadErrors[keyTheory] && <p className="text-xs text-red-500 mt-1">{uploadErrors[keyTheory]}</p>}
                                                {uploadSuccess[keyTheory] && <p className="text-xs text-green-500 mt-1">{uploadSuccess[keyTheory]}</p>}
                                            </div>
                                        )}
                                    </div>

                                    {/* Lab Syllabus (conditional) */}
                                    {canHaveLabSyllabus && (
                                        <div className="p-3 border dark:border-gray-600 rounded-md">
                                            <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Lab Syllabus</h5>
                                            {labSyllabus ? (
                                                <div className="flex items-center justify-between">
                                                    <a href={`${API_BASE_URL.replace('/api', '')}${labSyllabus.filePath}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs underline truncate max-w-[150px] sm:max-w-xs" title={labSyllabus.filePath}>
                                                        View Current (Ver. {labSyllabus.year} Sem {labSyllabus.semester})
                                                    </a>
                                                    {isAdminOrFaculty && <button onClick={() => handleDeleteSyllabus(labSyllabus.id, subject.name, 'Lab')} className={buttonDangerStyle}>Delete</button>}
                                                </div>
                                            ) : <p className="text-xs text-gray-400 dark:text-gray-500">No lab syllabus uploaded.</p>}

                                            {isAdminOrFaculty && (
                                                <div className="mt-2">
                                                    <input type="file" id={`file_${keyLab}`} accept=".pdf" onChange={(e) => handleFileSelect(subject.id, 'Lab', e)} className="text-xs dark:text-gray-300 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 dark:file:bg-blue-800 file:text-blue-700 dark:file:text-blue-200 hover:file:bg-blue-100 dark:hover:file:bg-blue-700 w-full" />
                                                    <button onClick={() => handleUploadSyllabus(subject.id, subject.name, 'Lab')} className={`${buttonPrimaryStyle} mt-1 w-full`} disabled={isUploading[keyLab] || !currentFileUploads[keyLab]}>
                                                        {isUploading[keyLab] ? 'Uploading...' : (labSyllabus ? 'Replace Lab' : 'Upload Lab')}
                                                    </button>
                                                    {uploadErrors[keyLab] && <p className="text-xs text-red-500 mt-1">{uploadErrors[keyLab]}</p>}
                                                    {uploadSuccess[keyLab] && <p className="text-xs text-green-500 mt-1">{uploadSuccess[keyLab]}</p>}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {!canHaveLabSyllabus && (
                                        <div className="p-3 border border-dashed dark:border-gray-700 rounded-md">
                                            <h5 className="text-sm font-medium text-gray-400 dark:text-gray-500 mb-2">Lab Syllabus</h5>
                                            <p className="text-xs text-gray-400 dark:text-gray-500">Not applicable (Subject has 0 practical hours).</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default SyllabusManagementPage;
