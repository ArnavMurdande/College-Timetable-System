// File: client/src/pages/StudentElectiveChoicePage.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../App'; // Assuming this context provides userInfo
import { useDepartment } from '../context/DepartmentContext'; // Assuming this context provides department info
import * as XLSX from 'xlsx';
// import { toast } from 'react-toastify'; // Assuming you use react-toastify for notifications

const API_BASE_URL = 'http://localhost:5001/api'; // Ensure this matches your backend

const YEARS_FOR_FILTER_AND_ENTRY = [
    { value: 1, label: 'FE (First Year)' }, { value: 2, label: 'SE (Second Year)' },
    { value: 3, label: 'TE (Third Year)' }, { value: 4, label: 'BE (Fourth Year)' },
];
const SEMESTER_TYPES_FOR_FILTER_AND_ENTRY = [{ value: 'odd', label: 'Odd' }, { value: 'even', label: 'Even' }];

const ACADEMIC_SESSION_YEARS = Array.from({ length: 2049 - 2025 + 1 }, (_, i) => {
    const year = 2025 + i;
    return { value: year, label: `${year}-${(year + 1).toString().slice(-2)}` };
});

const SUBJECT_TYPES_FOR_VIEW_FILTER = [
    { value: 'DLO', label: 'DLO' },
    { value: 'ILOT', label: 'ILOT' },
];

// Helper function to calculate semester number (1-8) from year level (1-4)
const calculateSemesterNumber = (yearLevel, semesterType) => {
    if (!yearLevel || !semesterType) return '';
    const yearNum = parseInt(yearLevel);
    if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) return '';
    return semesterType.toLowerCase() === 'odd' ? (yearNum * 2 - 1) : (yearNum * 2);
};

function StudentElectiveChoicePage() {
    const { userInfo } = useAuth();
    const { departments, isLoadingDepartments, fetchDepartments: fetchContextDepartments, selectedDepartment: globalSelectedDepartment } = useDepartment();

    const [entryFilters, setEntryFilters] = useState({
        departmentId: '', yearLevel: '', semesterType: '',
        academicSessionYear: ACADEMIC_SESSION_YEARS[0]?.value.toString() || '2025',
    });
    const [viewFilters, setViewFilters] = useState({
        departmentId: '', academicSessionYear: ACADEMIC_SESSION_YEARS[0]?.value.toString() || '2025',
        yearLevel: '', semesterType: '',
        subjectType: '', courseCategory: '', subjectId: '', divisionId: '',
    });

    const [selectableSubjects, setSelectableSubjects] = useState([]);
    const [selectableBatches, setSelectableBatches] = useState([]);
    const [electiveChoices, setElectiveChoices] = useState({});
    const [savedChoicesForView, setSavedChoicesForView] = useState([]);
    const [relevantTempDivisions, setRelevantTempDivisions] = useState([]);
    const [viewFilterSubjects, setViewFilterSubjects] = useState([]);
    const [viewFilterDivisions, setViewFilterDivisions] = useState([]); 
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [viewError, setViewError] = useState('');
    const fileInputRef = useRef(null);
    const [isUploadingExcel, setIsUploadingExcel] = useState(false);
    const [excelUploadStatus, setExcelUploadStatus] = useState({ message: '', errors: [], created: 0, updated: 0, deleted: 0 });

    const isAdmin = useMemo(() => userInfo?.role === 'Admin', [userInfo]); // Use isAdmin for conditional rendering

    useEffect(() => {
        const deptId = globalSelectedDepartment ? globalSelectedDepartment.id : '';
        const defaultAcademicSession = ACADEMIC_SESSION_YEARS[0]?.value.toString() || '2025';
        setEntryFilters(prev => ({ ...prev, departmentId: deptId, yearLevel: '', semesterType: '', academicSessionYear: defaultAcademicSession }));
        setViewFilters(prev => ({ ...prev, departmentId: deptId, yearLevel: '', semesterType: '', subjectType: '', courseCategory: '', subjectId: '', divisionId: '', academicSessionYear: defaultAcademicSession }));
    }, [globalSelectedDepartment]);

    useEffect(() => {
        if (departments.length === 0 && !isLoadingDepartments) fetchContextDepartments();
    }, [departments.length, isLoadingDepartments, fetchContextDepartments]);

    const fetchSelectableSubjectsForEntry = useCallback(async () => {
        if (!entryFilters.departmentId || !entryFilters.yearLevel || !entryFilters.semesterType) {
            setSelectableSubjects([]); return;
        }
        setIsLoading(true); setError('');
        const token = localStorage.getItem('authToken');
        try {
            const response = await axios.get(`${API_BASE_URL}/elective-choices/selectable-subjects`, {
                params: { departmentId: entryFilters.departmentId, year: entryFilters.yearLevel, semesterType: entryFilters.semesterType },
                headers: { Authorization: `Bearer ${token}` },
            });
            setSelectableSubjects(response.data || []);
        } catch (err) { setError(err.response?.data?.message || 'Failed to fetch DLO/ILOT subjects.'); setSelectableSubjects([]); }
        finally { setIsLoading(false); }
    }, [entryFilters.departmentId, entryFilters.yearLevel, entryFilters.semesterType]);

    const fetchSelectableBatchesForEntry = useCallback(async () => {
        if (!entryFilters.departmentId || !entryFilters.yearLevel || !entryFilters.semesterType) {
            setSelectableBatches([]); return;
        }
        setIsLoading(true); setError('');
        const token = localStorage.getItem('authToken');
        try {
            const response = await axios.get(`${API_BASE_URL}/elective-choices/selectable-batches`, {
                params: { departmentId: entryFilters.departmentId, year: entryFilters.yearLevel, semesterType: entryFilters.semesterType },
                headers: { Authorization: `Bearer ${token}` },
            });
            setSelectableBatches(response.data || []);
        } catch (err) { setError(err.response?.data?.message || 'Failed to fetch batches.'); setSelectableBatches([]); }
        finally { setIsLoading(false); }
    }, [entryFilters.departmentId, entryFilters.yearLevel, entryFilters.semesterType]);

    const fetchRelevantTemporaryDivisions = useCallback(async () => {
        if (!entryFilters.departmentId || !entryFilters.yearLevel || !entryFilters.semesterType) {
            setRelevantTempDivisions([]);
            return;
        }
        setIsLoading(true);
        const token = localStorage.getItem('authToken');
        const calculatedSemester = calculateSemesterNumber(entryFilters.yearLevel, entryFilters.semesterType);
        if (!calculatedSemester) {
            setRelevantTempDivisions([]);
            setIsLoading(false);
            return;
        }
        try {
            const response = await axios.get(`${API_BASE_URL}/divisions`, { 
                params: {
                    departmentId: entryFilters.departmentId,
                    year: entryFilters.yearLevel,
                    semester: calculatedSemester,
                },
                headers: { Authorization: `Bearer ${token}` },
            });
            const allDivs = response.data || [];
            const tempDloIlotDivs = allDivs.filter(div =>
                div.divisionType === 'Temporary' &&
                (div.linkedSubjectType === 'DLO' || div.linkedSubjectType === 'ILOT') &&
                div.composedOfPermanentBatches && div.composedOfPermanentBatches.length > 0
            );
            setRelevantTempDivisions(tempDloIlotDivs);
        } catch (err) {
            console.error("Error fetching divisions for elective choices:", err);
            setError(err.response?.data?.message || 'Failed to fetch division data for linking.');
            setRelevantTempDivisions([]);
        } finally {
            setIsLoading(false);
        }
    }, [entryFilters.departmentId, entryFilters.yearLevel, entryFilters.semesterType]);

    const fetchExistingChoicesForEntryForm = useCallback(async () => {
        const calculatedSemester = calculateSemesterNumber(entryFilters.yearLevel, entryFilters.semesterType);
        if (!entryFilters.departmentId || !entryFilters.academicSessionYear || !calculatedSemester) {
            setElectiveChoices({}); return;
        }
        setIsLoading(true); setError('');
        const token = localStorage.getItem('authToken');
        try {
            const response = await axios.get(`${API_BASE_URL}/elective-choices`, {
                params: { departmentId: entryFilters.departmentId, academicYear: entryFilters.academicSessionYear, semester: calculatedSemester },
                headers: { Authorization: `Bearer ${token}` },
            });
            const fetchedChoices = response.data || [];
            const choicesMap = {};
            fetchedChoices.forEach(choice => {
                choicesMap[`${choice.batchId}_${choice.subjectId}`] = choice.studentCount.toString();
            });
            setElectiveChoices(choicesMap);
        } catch (err) { setError(err.response?.data?.message || 'Failed to pre-fill existing choices.'); setElectiveChoices({}); }
        finally { setIsLoading(false); }
    }, [entryFilters.departmentId, entryFilters.academicSessionYear, entryFilters.yearLevel, entryFilters.semesterType]);

    useEffect(() => {
        if (entryFilters.departmentId && entryFilters.yearLevel && entryFilters.semesterType) {
            fetchSelectableSubjectsForEntry();
            fetchSelectableBatchesForEntry();
            fetchRelevantTemporaryDivisions();
            if (entryFilters.academicSessionYear) fetchExistingChoicesForEntryForm();
        } else {
            setSelectableSubjects([]); setSelectableBatches([]); setElectiveChoices({});
            setRelevantTempDivisions([]);
        }
    }, [entryFilters, fetchSelectableSubjectsForEntry, fetchSelectableBatchesForEntry, fetchRelevantTemporaryDivisions, fetchExistingChoicesForEntryForm]);

    const fetchViewFilterDropdownData = useCallback(async () => {
        if (!viewFilters.departmentId || !viewFilters.yearLevel || !viewFilters.semesterType) {
            setViewFilterSubjects([]); 
            setViewFilterDivisions([]); 
            return;
        }
        const token = localStorage.getItem('authToken');
        
        try {
            const subjectsRes = await axios.get(`${API_BASE_URL}/elective-choices/selectable-subjects`, {
                params: { 
                    departmentId: viewFilters.departmentId, 
                    year: viewFilters.yearLevel, 
                    semesterType: viewFilters.semesterType 
                },
                headers: { Authorization: `Bearer ${token}` },
            });
            setViewFilterSubjects(subjectsRes.data || []);

            const divisionsRes = await axios.get(`${API_BASE_URL}/elective-choices/common-permanent-divisions`, {
                params: {
                    departmentId: viewFilters.departmentId,
                    year: viewFilters.yearLevel, 
                    semesterType: viewFilters.semesterType 
                },
                headers: { Authorization: `Bearer ${token}` },
            });
            setViewFilterDivisions(divisionsRes.data || []);

        } catch (err) { 
            console.error("Error fetching data for view filters:", err); 
            setViewFilterSubjects([]); 
            setViewFilterDivisions([]); 
        }
    }, [viewFilters.departmentId, viewFilters.yearLevel, viewFilters.semesterType]);

    useEffect(() => { fetchViewFilterDropdownData(); }, [fetchViewFilterDropdownData]);

    const fetchSavedChoicesForView = useCallback(async () => {
        const calculatedSemester = calculateSemesterNumber(viewFilters.yearLevel, viewFilters.semesterType);
        const specificViewErrorMsg = "Please select Department, Academic Session, Year Level, and Semester Type for viewing choices.";

        if (!viewFilters.departmentId || !viewFilters.academicSessionYear) {
            setSavedChoicesForView([]);
            setViewError( (viewFilters.yearLevel || viewFilters.semesterType) && (!viewFilters.departmentId || !viewFilters.academicSessionYear) ? specificViewErrorMsg : "");
            return;
        }
        if ((viewFilters.yearLevel || viewFilters.semesterType) && !calculatedSemester) { 
            setViewError(specificViewErrorMsg);
            setSavedChoicesForView([]);
            return;
        }
         setViewError(''); 

        setIsLoading(true);
        const token = localStorage.getItem('authToken');
        try {
            const params = { 
                departmentId: viewFilters.departmentId, 
                academicSessionYear: viewFilters.academicSessionYear 
            };
            if (calculatedSemester) { 
                 params.yearLevel = viewFilters.yearLevel; 
                 params.semesterType = viewFilters.semesterType; 
            }
            if (viewFilters.subjectType) params.subjectType = viewFilters.subjectType;
            if (viewFilters.courseCategory) params.courseCategory = viewFilters.courseCategory;
            if (viewFilters.subjectId) params.subjectId = viewFilters.subjectId;
            if (viewFilters.divisionId) params.divisionId = viewFilters.divisionId; 

            const response = await axios.get(`${API_BASE_URL}/elective-choices`, { params, headers: { Authorization: `Bearer ${token}` } });
            setSavedChoicesForView(response.data || []);
        } catch (err) { setViewError(err.response?.data?.message || 'Failed to fetch saved choices.'); setSavedChoicesForView([]); }
        finally { setIsLoading(false); }
    }, [viewFilters]);

    useEffect(() => { fetchSavedChoicesForView(); }, [fetchSavedChoicesForView]);

    const handleEntryFilterChange = (e) => {
        const { name, value } = e.target;
        setEntryFilters(prev => ({ ...prev, [name]: value }));
        setError(''); setSuccessMessage('');
    };

    const handleViewFilterChange = (e) => {
        const { name, value } = e.target;
        setViewFilters(prev => ({ ...prev, [name]: value, ...(name === 'yearLevel' || name === 'semesterType' ? { divisionId: '', subjectId: '' } : {}) })); 
        setViewError('');
    };

    const handleStudentCountChange = (batchId, subjectId, count) => {
        const key = `${batchId}_${subjectId}`;
        const newCount = parseInt(count);
        setElectiveChoices(prev => ({ ...prev, [key]: isNaN(newCount) || newCount < 0 ? '' : newCount.toString() }));
    };

    const handleSaveChanges = async () => {
        const calculatedSemester = calculateSemesterNumber(entryFilters.yearLevel, entryFilters.semesterType);
        if (!entryFilters.academicSessionYear || !calculatedSemester || !entryFilters.departmentId) {
            setError("Department, Academic Session Year and valid Year/Semester Type for entry are required."); return;
        }
        if (Object.keys(electiveChoices).length === 0 && !Object.values(electiveChoices).some(val => val !== '' && Number(val) >= 0)) {
             setSuccessMessage("No student counts entered or all are zero. Nothing to save/update."); return;
        }

        setIsSaving(true); setError(''); setSuccessMessage('');
        const token = localStorage.getItem('authToken');
        const payloadChoices = Object.entries(electiveChoices).map(([key, studentCountStr]) => {
            const studentCount = parseInt(studentCountStr);
            const [batchId, subjectId] = key.split('_');
            return {
                academicYear: parseInt(entryFilters.academicSessionYear), semester: parseInt(calculatedSemester),
                departmentId: parseInt(entryFilters.departmentId), subjectId: parseInt(subjectId), batchId: parseInt(batchId),
                studentCount: isNaN(studentCount) || studentCount < 0 ? 0 : studentCount,
            };
        });
        try {
            const response = await axios.post(`${API_BASE_URL}/elective-choices`, { choices: payloadChoices }, { headers: { Authorization: `Bearer ${token}` } });
            setSuccessMessage(response.data.message || 'Elective choices saved successfully!');
            fetchExistingChoicesForEntryForm(); 
            fetchSavedChoicesForView(); 
        } catch (err) {
            console.error("Save Elective Choices Error:", err);
            setError(err.response?.data?.message || 'Failed to save elective choices.');
            if (err.response?.data?.errors) {
                setError(`Save failed. Errors: ${err.response.data.errors.map(e => `Choice (Index ${e.index}): ${e.message}`).join('; ')}`);
            }
        } finally { setIsSaving(false); }
    };

    const groupedSubjectsForEntry = useMemo(() => selectableSubjects.reduce((acc, subject) => {
        const category = subject.courseCategory || 'Uncategorized Electives';
        if (!acc[category]) acc[category] = [];
        acc[category].push(subject);
        return acc;
    }, {}), [selectableSubjects]);

    const isBatchAllowedForSubject = (batchId, subject) => {
        if (subject.subjectType !== 'DLO' && subject.subjectType !== 'ILOT') {
            return true; 
        }
        const linkedTempDivisionsForSubject = relevantTempDivisions.filter(div =>
            div.linkedSubjectType === subject.subjectType &&
            div.courseCategory === subject.courseCategory
        );
        if (linkedTempDivisionsForSubject.length === 0) {
            return false; 
        }
        for (const tempDiv of linkedTempDivisionsForSubject) {
            if (Array.isArray(tempDiv.composedOfPermanentBatches) &&
                tempDiv.composedOfPermanentBatches.some(composedBatch => composedBatch && composedBatch.id === batchId)) {
                return true; 
            }
        }
        return false; 
    };

    const handleExportExcel = () => {
        if (savedChoicesForView.length === 0) { setViewError("No data to export."); return; }
        const dataToExport = savedChoicesForView.map(choice => ({
            "Department Name": choice.department?.name || 'N/A',
            "Academic Session Start Year": choice.academicYear,
            "Semester Number": choice.semester,
            "Batch Name": choice.batch?.name || 'N/A',
            "Original Division Name": choice.batch?.permanentDivision?.name || 'N/A',
            "Subject Code": choice.subject?.code || 'N/A',
            "Subject Name": choice.subject?.name || 'N/A',
            "Subject Type": choice.subject?.subjectType || 'N/A',
            "Course Category": choice.subject?.courseCategory || 'N/A',
            "Student Count": choice.studentCount,
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "ElectiveChoices");
        XLSX.writeFile(workbook, `StudentElectiveChoices_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
        setSuccessMessage("Data exported to Excel successfully.");
    };

    const handleExcelFileImport = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        setIsUploadingExcel(true);
        setExcelUploadStatus({ message: 'Processing...', errors: [], created: 0, updated: 0, deleted: 0 });
        const token = localStorage.getItem('authToken');
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await axios.post(`${API_BASE_URL}/elective-choices/upload-excel`, formData, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
            });
            setExcelUploadStatus({
                message: response.data.message || "Excel import processed.",
                errors: response.data.errors || [],
                created: response.data.created || 0, updated: response.data.updated || 0, deleted: response.data.deleted || 0,
            });
            fetchExistingChoicesForEntryForm(); 
            fetchSavedChoicesForView(); 
        } catch (err) {
            console.error("Excel Import Error:", err.response);
            setExcelUploadStatus({
                message: err.response?.data?.message || "Excel import failed.",
                errors: err.response?.data?.errors || [{row: 'N/A', message: "General processing error."}],
                created: 0, updated: 0, deleted: 0
            });
        } finally { setIsUploadingExcel(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
    };

    const inputStyle = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 disabled:opacity-70";
    const labelStyle = "block text-sm font-medium text-gray-700 dark:text-gray-300";
    const buttonPrimaryStyle = "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-50";
    const tableHeaderStyle = "px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider";
    const tableCellStyle = "px-3 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300";
    const studentCountInputStyle = "w-20 p-1 border border-gray-300 dark:border-gray-500 rounded-md text-center bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 focus:ring-indigo-500 focus:border-indigo-500 dark:focus:border-indigo-400 dark:placeholder-gray-400";

    const viewErrorSpecificMsg = "Please select Department, Academic Session, Year Level, and Semester Type for viewing choices.";
    const viewErrorStyle = viewError === viewErrorSpecificMsg
        ? "bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 dark:bg-yellow-700/40 dark:text-yellow-100 dark:border-yellow-500 p-4 mb-4 rounded-md relative"
        : "bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-300 p-4 mb-4 rounded-md relative";


    return (
        <div className="container mx-auto p-4 md:p-6 space-y-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">
                Student Elective Choice (DLO/ILOT) {globalSelectedDepartment ? `(${globalSelectedDepartment.name})` : ''}
            </h1>

            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-300 p-4 mb-4 rounded-md" role="alert"><button onClick={()=>setError('')} className="float-right font-bold text-lg">&times;</button>{error}</div>}
            {successMessage && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-300 p-4 mb-4 rounded-md" role="alert"><button onClick={()=>setSuccessMessage('')} className="float-right font-bold text-lg">&times;</button>{successMessage}</div>}

            {/* Entry Section - Conditionally render based on isAdmin */}
            {isAdmin && (
                <section className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg shadow border dark:border-gray-700">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Enter/Update Student Counts</h2>
                    <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <label htmlFor="entryDeptFilter" className={labelStyle}>Department*</label>
                            <select name="departmentId" id="entryDeptFilter" value={entryFilters.departmentId} onChange={handleEntryFilterChange} required className={inputStyle} disabled={isLoadingDepartments || !!globalSelectedDepartment}>
                                <option value="">-- Select --</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                            {!!globalSelectedDepartment && <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">Global: {globalSelectedDepartment.name}</p>}
                        </div>
                        <div>
                            <label htmlFor="entryYearLevelFilter" className={labelStyle}>Year Level*</label>
                            <select name="yearLevel" id="entryYearLevelFilter" value={entryFilters.yearLevel} onChange={handleEntryFilterChange} required className={inputStyle}>
                                <option value="">-- Select --</option>{YEARS_FOR_FILTER_AND_ENTRY.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="entrySemesterTypeFilter" className={labelStyle}>Semester Type*</label>
                            <select name="semesterType" id="entrySemesterTypeFilter" value={entryFilters.semesterType} onChange={handleEntryFilterChange} required className={inputStyle}>
                                <option value="">-- Select --</option>{SEMESTER_TYPES_FOR_FILTER_AND_ENTRY.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="entryAcademicSessionYear" className={labelStyle}>Academic Session*</label>
                            <select name="academicSessionYear" id="entryAcademicSessionYear" value={entryFilters.academicSessionYear} onChange={handleEntryFilterChange} required className={inputStyle}>
                                {ACADEMIC_SESSION_YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
                            </select>
                        </div>
                    </div>

                    {isLoading && <p className="text-center py-5 text-gray-600 dark:text-gray-300">Loading data for entry...</p>}
                    {!isLoading && entryFilters.departmentId && entryFilters.yearLevel && entryFilters.semesterType && entryFilters.academicSessionYear && (
                        selectableBatches.length > 0 && Object.keys(groupedSubjectsForEntry).length > 0 ? (
                            <div className="mt-4">
                                <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow-md rounded-lg border dark:border-gray-700">
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                        <thead className="bg-gray-100 dark:bg-gray-700/70">
                                            <tr>
                                                <th className="sticky left-0 bg-gray-100 dark:bg-gray-700/70 z-10 px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Batch (Division)</th>
                                                {Object.entries(groupedSubjectsForEntry).map(([category, subjectsInCategory]) => (
                                                    subjectsInCategory.map(subject => (
                                                        <th key={subject.id} className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300" title={`${subject.subjectType} - ${subject.courseCategory || 'N/A'}`}>
                                                            {subject.name} ({subject.code})
                                                            <div className="text-xxs font-normal normal-case text-gray-400 dark:text-gray-500">{category}</div>
                                                        </th>
                                                    ))
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                            {selectableBatches.map(batch => (
                                                <tr key={batch.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                    <td className="sticky left-0 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 z-10 px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-300">{batch.name} ({batch.divisionName})</td>
                                                    {Object.entries(groupedSubjectsForEntry).map(([category, subjectsInCategory]) => (
                                                        subjectsInCategory.map(subject => {
                                                            const isAllowed = isBatchAllowedForSubject(batch.id, subject);
                                                            const cellKey = `${batch.id}_${subject.id}`;
                                                            return (
                                                                <td key={cellKey} className="px-3 py-2 whitespace-nowrap text-sm text-center">
                                                                    <span
                                                                        className="inline-block"
                                                                        onClick={() => {
                                                                            if (!isAllowed && isAdmin) { 
                                                                                alert("This batch is not part of any temporary division configured for this DLO/ILOT subject. Please check Division & Batch Management to assign this batch to a relevant temporary group for this subject's course category.");
                                                                            }
                                                                        }}
                                                                    >
                                                                        <input type="number" min="0"
                                                                            value={electiveChoices[cellKey] !== undefined ? electiveChoices[cellKey] : ''}
                                                                            onChange={(e) => handleStudentCountChange(batch.id, subject.id, e.target.value)}
                                                                            className={`${studentCountInputStyle} ${!isAllowed ? 'bg-gray-200 dark:bg-gray-600 cursor-not-allowed opacity-70' : ''}`}
                                                                            placeholder="0"
                                                                            disabled={!isAdmin || isSaving || !isAllowed}
                                                                        />
                                                                    </span>
                                                                </td>
                                                            );
                                                        })
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {isAdmin && (
                                    <div className="mt-6 flex justify-end">
                                        <button onClick={handleSaveChanges} className={buttonPrimaryStyle} disabled={isSaving || isLoading}>
                                            {isSaving ? 'Saving...' : 'Save Choices'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : ( entryFilters.departmentId && entryFilters.yearLevel && entryFilters.semesterType && entryFilters.academicSessionYear && !isLoading &&
                            <p className="text-center py-5 text-gray-600 dark:text-gray-400">No DLO/ILOT subjects or batches (from 'Common' linked divisions) found for the selected entry criteria, or temporary DLO/ILOT divisions are not yet configured for these batches.</p>
                        )
                    )}
                </section>
            )}

            {/* View Section */}
            <section className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg shadow border dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">View Saved Elective Choices</h2>
                {viewError && <div className={viewErrorStyle} role="alert"><button onClick={()=>setViewError('')} className="float-right font-bold text-lg">&times;</button>{viewError}</div>}
                
                <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    <div><label htmlFor="viewDeptFilter" className={labelStyle}>Department</label><select name="departmentId" id="viewDeptFilter" value={viewFilters.departmentId} onChange={handleViewFilterChange} className={inputStyle} disabled={isLoadingDepartments || !!globalSelectedDepartment}><option value="">-- Select --</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>{!!globalSelectedDepartment && <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">Global: {globalSelectedDepartment.name}</p>}</div>
                    <div><label htmlFor="viewAcademicSessionYear" className={labelStyle}>Academic Session</label><select name="academicSessionYear" id="viewAcademicSessionYear" value={viewFilters.academicSessionYear} onChange={handleViewFilterChange} className={inputStyle}><option value="">-- Select --</option>{ACADEMIC_SESSION_YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}</select></div>
                    <div><label htmlFor="viewYearLevel" className={labelStyle}>Year Level</label><select name="yearLevel" id="viewYearLevel" value={viewFilters.yearLevel} onChange={handleViewFilterChange} className={inputStyle}><option value="">-- All --</option>{YEARS_FOR_FILTER_AND_ENTRY.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}</select></div>
                    <div><label htmlFor="viewSemesterType" className={labelStyle}>Semester Type</label><select name="semesterType" id="viewSemesterType" value={viewFilters.semesterType} onChange={handleViewFilterChange} className={inputStyle}><option value="">-- All --</option>{SEMESTER_TYPES_FOR_FILTER_AND_ENTRY.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}</select></div>
                    <div><label htmlFor="viewSubjectType" className={labelStyle}>Subject Type</label><select name="subjectType" id="viewSubjectType" value={viewFilters.subjectType} onChange={handleViewFilterChange} className={inputStyle}><option value="">All DLO/ILOT</option>{SUBJECT_TYPES_FOR_VIEW_FILTER.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}</select></div>
                    <div><label htmlFor="viewCourseCategory" className={labelStyle}>Course Category</label><input type="text" name="courseCategory" id="viewCourseCategory" value={viewFilters.courseCategory} onChange={handleViewFilterChange} placeholder="e.g., DLO3-AI" className={inputStyle} /></div>
                    <div><label htmlFor="viewSubjectId" className={labelStyle}>Subject</label><select name="subjectId" id="viewSubjectId" value={viewFilters.subjectId} onChange={handleViewFilterChange} className={inputStyle} disabled={!viewFilters.departmentId || !viewFilters.yearLevel || !viewFilters.semesterType || viewFilterSubjects.length === 0}><option value="">All Subjects</option>{viewFilterSubjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}</select></div>
                    <div><label htmlFor="viewDivisionId" className={labelStyle}>Original Division (of Batch)</label><select name="divisionId" id="viewDivisionId" value={viewFilters.divisionId} onChange={handleViewFilterChange} className={inputStyle} disabled={!viewFilters.departmentId || !viewFilters.yearLevel || !viewFilters.semesterType || viewFilterDivisions.length === 0}><option value="">All Divisions</option>{viewFilterDivisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                </div>
                <div className="flex flex-col sm:flex-row justify-end gap-3 mb-4">
                    {isAdmin && (
                        <div className="relative w-full sm:w-auto">
                            <label htmlFor="excel-upload-input" className={`w-full sm:w-auto flex justify-center items-center px-3 py-2 text-white rounded-md shadow-sm cursor-pointer text-xs font-medium ${isUploadingExcel ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                                {isUploadingExcel ? 'Importing...' : 'Import from Excel'}
                            </label>
                            <input id="excel-upload-input" type="file" accept=".xlsx, .xls" onChange={handleExcelFileImport} className="hidden" disabled={isUploadingExcel || !isAdmin} ref={fileInputRef} />
                        </div>
                    )}
                    <button onClick={handleExportExcel} className={`${buttonPrimaryStyle} bg-teal-600 hover:bg-teal-700 text-xs w-full sm:w-auto`} disabled={isLoading || savedChoicesForView.length === 0}>
                        Export View to Excel
                    </button>
                </div>
                {excelUploadStatus.message && (
                    <div className={`p-3 mb-3 rounded-md text-xs ${excelUploadStatus.errors.length > 0 ? 'bg-yellow-100 dark:bg-yellow-800/60 text-yellow-700 dark:text-yellow-200' : 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-200'}`}>
                        <p>{excelUploadStatus.message}</p>
                        {excelUploadStatus.errors.length > 0 && (
                            <ul className="list-disc list-inside mt-1 max-h-20 overflow-y-auto">
                                {excelUploadStatus.errors.map((err, idx) => <li key={idx}>Row {err.row || 'N/A'}: {err.message}</li>)}
                            </ul>
                        )}
                    </div>
                )}

                {isLoading && <p className="text-center py-5 text-gray-600 dark:text-gray-300">Loading saved choices...</p>}
                {!isLoading && viewFilters.departmentId && viewFilters.academicSessionYear && (viewFilters.yearLevel && viewFilters.semesterType || (!viewFilters.yearLevel && !viewFilters.semesterType)) && (
                    savedChoicesForView.length > 0 ? (
                        <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow-md rounded-lg border dark:border-gray-700">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-100 dark:bg-gray-700/70">
                                    <tr>
                                        <th className={tableHeaderStyle}>Batch (Orig. Div)</th><th className={tableHeaderStyle}>Subject (Code)</th>
                                        <th className={tableHeaderStyle}>Sub. Type</th><th className={tableHeaderStyle}>Course Cat.</th>
                                        <th className={`${tableHeaderStyle} text-center`}>Count</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {savedChoicesForView.map(choice => (
                                        <tr key={choice.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className={tableCellStyle}>{choice.batch?.name} ({choice.batch?.permanentDivision?.name || 'N/A'})</td>
                                            <td className={tableCellStyle}>{choice.subject?.name} ({choice.subject?.code})</td>
                                            <td className={tableCellStyle}>{choice.subject?.subjectType}</td>
                                            <td className={tableCellStyle}>{choice.subject?.courseCategory || '-'}</td>
                                            <td className={`${tableCellStyle} text-center`}>{choice.studentCount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                         viewFilters.departmentId && viewFilters.academicSessionYear && (calculateSemesterNumber(viewFilters.yearLevel, viewFilters.semesterType) || (!viewFilters.yearLevel && !viewFilters.semesterType) ) && !isLoading &&
                        <p className="text-center py-5 text-gray-600 dark:text-gray-400">No saved DLO/ILOT choices for the selected view criteria.</p>
                    )
                )}
            </section>
        </div>
    );
}

export default StudentElectiveChoicePage;
