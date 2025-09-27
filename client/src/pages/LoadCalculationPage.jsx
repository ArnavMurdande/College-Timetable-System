// File: client/src/pages/LoadCalculationPage.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../App';
import { useDepartment } from '../context/DepartmentContext';
import * as XLSX from 'xlsx';

const API_BASE_URL = 'http://localhost:5001/api';

const YEARS = [
    { value: 1, label: 'FE (First Year)' }, { value: 2, label: 'SE (Second Year)' },
    { value: 3, label: 'TE (Third Year)' }, { value: 4, label: 'BE (Fourth Year)' },
];
const SEMESTER_TYPES = [{ value: 'odd', label: 'Odd' }, { value: 'even', label: 'Even' }];

const FACULTY_DESIGNATIONS_OPTIONS = [
    { value: '', label: 'All Designations' },
    { value: 'HOD', label: 'HOD' },
    { value: 'Professor', label: 'Professor' },
    { value: 'AssociateProfessor', label: 'Associate Professor' },
    { value: 'AssistantProfessor', label: 'Assistant Professor' },
];
const SUBJECT_TYPES_OPTIONS = [
    { value: '', label: 'All Subject Types' },
    { value: 'Common', label: 'Common' },
    { value: 'DLO', label: 'DLO' },
    { value: 'ILOT', label: 'ILOT' },
    { value: 'MajorMinor', label: 'Major/Minor' },
];

const formatDesignationEnum = (designationEnumString) => {
    if (!designationEnumString) return 'N/A';
    return designationEnumString.replace(/([A-Z])/g, ' $1').replace(/^ /, '').trim();
};


function LoadCalculationPage() {
    const { userInfo } = useAuth();
    const { departments, isLoadingDepartments, selectedDepartment: globalSelectedDepartment, fetchDepartments: fetchContextDepartments } = useDepartment();

    const [viewType, setViewType] = useState('faculty');
    const [filters, setFilters] = useState({
        departmentId: '',
        year: '',
        semesterType: '',
        facultyDesignation: '',
        subjectType: '',
        courseCategory: '',
    });
    const [facultyLoadData, setFacultyLoadData] = useState([]);
    const [subjectLoadData, setSubjectLoadData] = useState([]);
    const [departmentLoadData, setDepartmentLoadData] = useState(null);
    
    const [avgStudentCounts, setAvgStudentCounts] = useState({});
    const [isSavingAvgCounts, setIsSavingAvgCounts] = useState(false);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [showRemainingLoadDetails, setShowRemainingLoadDetails] = useState(false);
    const [showExternalFacultyModal, setShowExternalFacultyModal] = useState(false); // New state for modal


    const isAdmin = useMemo(() => userInfo?.role === 'Admin', [userInfo]);

    useEffect(() => {
        const deptId = globalSelectedDepartment ? globalSelectedDepartment.id.toString() : '';
        setFilters(prev => ({
            ...prev,
            departmentId: deptId,
            facultyDesignation: deptId !== prev.departmentId ? '' : prev.facultyDesignation,
            subjectType: deptId !== prev.departmentId ? '' : prev.subjectType,
            courseCategory: deptId !== prev.departmentId ? '' : prev.courseCategory,
        }));
        setFacultyLoadData([]);
        setSubjectLoadData([]);
        setDepartmentLoadData(null);
        setAvgStudentCounts({});
        setShowRemainingLoadDetails(false);
        setShowExternalFacultyModal(false); // Reset modal state
    }, [globalSelectedDepartment]);
    
    useEffect(() => {
        if (departments.length === 0 && !isLoadingDepartments) {
            fetchContextDepartments();
        }
    }, [departments, isLoadingDepartments, fetchContextDepartments]);


    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
        setError('');
        setSuccessMessage('');
        if (['departmentId', 'year', 'semesterType'].includes(name)) {
            setFacultyLoadData([]);
            setSubjectLoadData([]);
            setDepartmentLoadData(null);
            setAvgStudentCounts({});
            setShowRemainingLoadDetails(false);
            setShowExternalFacultyModal(false); // Reset modal on filter change
        }
    };
    
    const handleAvgStudentCountChange = (subjectId, type, value) => {
        const count = parseInt(value);
        const newCount = value === '' ? '' : (isNaN(count) || count < 0 ? (avgStudentCounts[subjectId]?.[type] ?? '') : count.toString());

        setAvgStudentCounts(prev => ({
            ...prev,
            [subjectId]: {
                ...prev[subjectId],
                [type]: newCount
            }
        }));

        if (type === 'division' && Number(newCount) > 52) {
            alert(`Suggestion: Average students per division (${newCount}) exceeds 52. Consider creating a new division for this subject if feasible.`);
        }
        if (type === 'batch' && Number(newCount) > 17) {
            alert(`Suggestion: Average students per batch (${newCount}) for labs exceeds 17. Consider creating new batches if feasible.`);
        }
    };

    const handleSaveAvgStudentCounts = async () => {
        setIsSavingAvgCounts(true);
        setError('');
        setSuccessMessage('');
        const token = localStorage.getItem('authToken');
        let successCount = 0;
        let errorCount = 0;
        let cumulativeErrorMessages = "";

        for (const subjectIdStr in avgStudentCounts) {
            const subjectId = parseInt(subjectIdStr);
            const counts = avgStudentCounts[subjectId];
            
            if (counts && (counts.division !== undefined || counts.batch !== undefined)) {
                const originalSubject = subjectLoadData.find(s => s.subjectId === subjectId);
                const originalAvgDiv = originalSubject ? (originalSubject.avgStudentsPerDivision !== null ? originalSubject.avgStudentsPerDivision.toString() : '') : '';
                const originalAvgBatch = originalSubject ? (originalSubject.avgStudentsPerBatch !== null ? originalSubject.avgStudentsPerBatch.toString() : '') : '';

                const currentAvgDiv = counts.division !== undefined ? counts.division.toString() : originalAvgDiv;
                const currentAvgBatch = counts.batch !== undefined ? counts.batch.toString() : originalAvgBatch;

                if (currentAvgDiv !== originalAvgDiv || currentAvgBatch !== originalAvgBatch) {
                    try {
                        await axios.put(`${API_BASE_URL}/load-calculation/${subjectId}/avg-students`, {
                            avgStudentsPerDivision: currentAvgDiv === '' ? null : parseInt(currentAvgDiv),
                            avgStudentsPerBatch: currentAvgBatch === '' ? null : parseInt(currentAvgBatch),
                        }, { headers: { Authorization: `Bearer ${token}` } });
                        successCount++;
                    } catch (err) {
                        console.error(`Error saving avg counts for subject ${subjectId}:`, err);
                        errorCount++;
                        let detailMessage = `Failed for Subject ID ${subjectId}.`;
                        if (err.response && err.response.data && err.response.data.message) {
                            detailMessage = `Failed for Subject ID ${subjectId}: ${err.response.data.message}`;
                        } else if (err.response && err.response.statusText) {
                            detailMessage = `Failed for Subject ID ${subjectId}: Server responded with ${err.response.status} (${err.response.statusText})`;
                        }
                        cumulativeErrorMessages += ` ${detailMessage}`;
                    }
                }
            }
        }
        setIsSavingAvgCounts(false);
        if (errorCount > 0) {
            setError(`Some student counts failed to save.${cumulativeErrorMessages}`);
        }
        if (successCount > 0) {
            setSuccessMessage(`${successCount} subject(s) average student counts saved successfully! Refreshing data...`);
            fetchData();
        } else if (errorCount === 0) {
            setSuccessMessage("No changes in average student counts to save.");
        }
    };


    const fetchData = useCallback(async () => {
        if (!filters.departmentId || !filters.year || !filters.semesterType) {
            setError('Please select Department, Year, and Semester Type to view load calculations.');
            setFacultyLoadData([]);
            setSubjectLoadData([]);
            setDepartmentLoadData(null);
            setAvgStudentCounts({});
            setShowRemainingLoadDetails(false);
            setShowExternalFacultyModal(false);
            return;
        }
        setIsLoading(true);
        setError('');
        setSuccessMessage('');
        setShowRemainingLoadDetails(false);
        setShowExternalFacultyModal(false);
        const token = localStorage.getItem('authToken');
        
        let endpoint = '';
        let params = {
            departmentId: filters.departmentId,
            year: filters.year,
            semesterType: filters.semesterType,
        };

        if (viewType === 'faculty') {
            endpoint = '/load-calculation/faculty';
            if (filters.facultyDesignation) params.designation = filters.facultyDesignation;
        } else if (viewType === 'subject') {
            endpoint = '/load-calculation/subject';
            if (filters.subjectType) params.subjectType = filters.subjectType;
            if (filters.courseCategory) params.courseCategory = filters.courseCategory;
        } else if (viewType === 'department') {
            endpoint = '/load-calculation/department';
        } else {
            setIsLoading(false); return;
        }
        
        try {
            const response = await axios.get(`${API_BASE_URL}${endpoint}`, {
                params,
                headers: { Authorization: `Bearer ${token}` },
            });
            if (viewType === 'faculty') {
                setFacultyLoadData(response.data || []);
            } else if (viewType === 'subject') {
                const data = response.data || [];
                setSubjectLoadData(data);
                const initialAvgCounts = {};
                data.forEach(sub => {
                    initialAvgCounts[sub.subjectId] = {
                        division: sub.avgStudentsPerDivision !== null ? sub.avgStudentsPerDivision.toString() : '',
                        batch: sub.avgStudentsPerBatch !== null ? sub.avgStudentsPerBatch.toString() : ''
                    };
                });
                setAvgStudentCounts(initialAvgCounts);
            } else if (viewType === 'department') {
                setDepartmentLoadData(response.data || null); // Will contain externalFacultyCount and externalFacultyDetails
            }
        } catch (err) {
            console.error(`Error fetching ${viewType} load data:`, err);
            setError(err.response?.data?.message || `Failed to fetch ${viewType} load data.`);
            setFacultyLoadData([]);
            setSubjectLoadData([]);
            setDepartmentLoadData(null);
            setAvgStudentCounts({});
        } finally {
            setIsLoading(false);
        }
    }, [filters, viewType]);

    const currentDepartmentName = globalSelectedDepartment?.name || departments.find(d => d.id === parseInt(filters.departmentId))?.name || 'Selected Department';
    const currentYearLabel = YEARS.find(y => y.value.toString() === filters.year)?.label || '';
    const currentSemesterTypeLabel = SEMESTER_TYPES.find(st => st.value === filters.semesterType)?.label || '';
    const academicContextDisplay = filters.departmentId && filters.year && filters.semesterType
        ? `${currentDepartmentName} - ${currentYearLabel} (${currentSemesterTypeLabel} Semester)`
        : "Please select filters";

    const designationSummary = useMemo(() => {
        if (viewType !== 'faculty' || facultyLoadData.length === 0) return null;
        const summary = {};
        FACULTY_DESIGNATIONS_OPTIONS.filter(opt => opt.value).forEach(desigOpt => {
            summary[desigOpt.value] = { count: 0, totalLoad: 0, label: desigOpt.label };
        });

        let overallTotalDepartmentLoad = 0;

        facultyLoadData.forEach(faculty => {
            if (summary[faculty.facultyDesignation]) {
                summary[faculty.facultyDesignation].count++;
                summary[faculty.facultyDesignation].totalLoad += faculty.grandTotalLoad;
            }
            overallTotalDepartmentLoad += faculty.grandTotalLoad;
        });
        summary.Overall = { count: facultyLoadData.length, totalLoad: overallTotalDepartmentLoad, label: 'Department Total' };
        return summary;
    }, [facultyLoadData, viewType]);
    
    const handleExportFacultyLoad = () => {
        if (facultyLoadData.length === 0) {
             setError("No faculty load data to export.");
             return;
        }
        setSuccessMessage(''); setError('');
        const dataToExport = [];
        dataToExport.push({ "Faculty Name": `Faculty Load Report for: ${academicContextDisplay}` });
        dataToExport.push({});

        facultyLoadData.forEach(faculty => {
            if (faculty.subjects.length > 0) {
                faculty.subjects.forEach((subject, index) => {
                    dataToExport.push({
                        "Faculty Name": index === 0 ? faculty.facultyName : "",
                        "Faculty ID": index === 0 ? faculty.facultyUniqueId : "",
                        "Faculty Dept.": index === 0 ? faculty.departmentName : "",
                        "Designation": index === 0 ? formatDesignationEnum(faculty.facultyDesignation) : "",
                        "Subject Name": subject.subjectName,
                        "Subject Code": subject.subjectCode,
                        "Subject Dept.": subject.subjectDepartmentName, 
                        "Base Theory Hrs": subject.baseTheoryHours > 0 ? subject.baseTheoryHours : '-',
                        "Base Practical Hrs": subject.basePracticalHours > 0 ? subject.basePracticalHours : '-',
                        "Theory Allocations": subject.theoryAllocationsCount > 0 ? subject.theoryAllocationsCount : '-',
                        "Lab Units Count": subject.labUnitsCount > 0 ? subject.labUnitsCount : '-',
                    });
                });
            } else {
                 dataToExport.push({
                    "Faculty Name": faculty.facultyName, "Faculty ID": faculty.facultyUniqueId,
                    "Faculty Dept.": faculty.departmentName, "Designation": formatDesignationEnum(faculty.facultyDesignation),
                    "Subject Name": "No load allocated", "Subject Code": "", "Subject Dept.": "",
                    "Base Theory Hrs": "", "Base Practical Hrs": "",
                    "Theory Allocations": "", "Lab Units Count": "",
                });
            }
            dataToExport.push({
                "Faculty Name": "TOTAL for " + faculty.facultyName, "Faculty ID": "", "Faculty Dept.": "", "Designation": "",
                "Subject Name": "", "Subject Code": "", "Subject Dept.": "",
                "Base Theory Hrs": faculty.totalTheoryHoursFaculty,
                "Base Practical Hrs": "", "Theory Allocations": "",
                "Lab Units Count": faculty.totalPracticalHoursFaculty, 
                "GRAND TOTAL LOAD": faculty.grandTotalLoad
            });
             dataToExport.push({});
        });

        if (designationSummary) {
            dataToExport.push({});
            dataToExport.push({ "Faculty Name": "DESIGNATION SUMMARY" });
            Object.values(designationSummary).filter(s => s.label !== 'Department Total').forEach(summaryItem => {
                 if(summaryItem.count > 0) {
                    dataToExport.push({
                        "Faculty Name": summaryItem.label,
                        "Faculty ID": `${summaryItem.count} Faculty`,
                        "GRAND TOTAL LOAD": summaryItem.totalLoad
                    });
                }
            });
             dataToExport.push({
                "Faculty Name": designationSummary.Overall.label,
                "Faculty ID": `${designationSummary.Overall.count} Faculty`,
                "GRAND TOTAL LOAD": designationSummary.Overall.totalLoad
            });
        }

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        worksheet['!autofilter'] = { ref: worksheet['!ref'] };
        const colWidths = [
            { wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 35 }, { wch: 15 }, { wch: 20 },
            { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }
        ];
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "FacultyLoad");
        XLSX.writeFile(workbook, `FacultyLoad_${currentDepartmentName.replace(/ /g, '_')}_${currentYearLabel.replace(/ /g, '_')}_${currentSemesterTypeLabel}.xlsx`);
        setSuccessMessage("Faculty load data exported successfully!");
    };

    const handleExportSubjectLoad = () => {
        if (subjectLoadData.length === 0) {
            setError("No subject load data to export.");
            return;
        }
        setSuccessMessage(''); setError('');
        
        const header = [`Subject Load Report for: ${academicContextDisplay}`];
        const wsData = [header, []];

        const subjectExportData = subjectLoadData.map((subject, index) => ({
            "Sr.No.": index + 1,
            "Subject Name": subject.subjectName,
            "Subject Code": subject.subjectCode,
            "Year": YEARS.find(y => y.value === subject.year)?.label || subject.year,
            "Subject Type": subject.subjectType,
            "Course Category": subject.courseCategory || '-',
            "Base Theory Hrs": subject.baseTheoryHours,
            "Theory Divisions Count": subject.distinctDivisionsTheoryCount,
            "Total Theory Engagement Hrs": subject.totalTheoryEngagementHours,
            "Base Practical Hrs": subject.basePracticalHours,
            "Lab Units Count": subject.totalPracticalUnits,
            "Total Practical Engagement Hrs": subject.totalPracticalEngagementHours,
            "Overall Subject Load": subject.overallTotalLoad,
            "Avg. Stud./Div": avgStudentCounts[subject.subjectId]?.division || (subject.avgStudentsPerDivision !== null ? subject.avgStudentsPerDivision : ''),
            "Avg. Stud./Batch": subject.basePracticalHours === 0 ? 'N/A' : (avgStudentCounts[subject.subjectId]?.batch || (subject.avgStudentsPerBatch !== null ? subject.avgStudentsPerBatch : '')),
        }));

        wsData.push(...XLSX.utils.sheet_to_json(XLSX.utils.json_to_sheet(subjectExportData), {header:1}));

        const worksheet = XLSX.utils.aoa_to_sheet(wsData);
        worksheet['!autofilter'] = { ref: `A2:${XLSX.utils.encode_col(Object.keys(subjectExportData[0] || {}).length -1)}2` };

        const colWidths = [
            { wch: 8 }, { wch: 35 }, { wch: 15 }, { wch: 20 }, { wch: 15 },
            { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 25 }, { wch: 15 },
            { wch: 18 }, { wch: 28 }, { wch: 20 }, { wch: 18 }, { wch: 18 }
        ];
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "SubjectLoad");
        XLSX.writeFile(workbook, `SubjectLoad_${currentDepartmentName.replace(/ /g, '_')}_${currentYearLabel.replace(/ /g, '_')}_${currentSemesterTypeLabel}.xlsx`);
        setSuccessMessage("Subject load data exported successfully!");
    };

    const handleExportDepartmentLoad = () => {
        if (!departmentLoadData) {
            setError("No department load data to export.");
            return;
        }
        setSuccessMessage(''); setError('');
        const dataToExport = [
            { "Category": `Department Load Report for: ${academicContextDisplay}`, "Value": "" },
            { "Category": "", "Value": ""},
            { "Category": "Department", "Value": departmentLoadData.departmentName },
            { "Category": "Year", "Value": YEARS.find(y => y.value === departmentLoadData.year)?.label || departmentLoadData.year },
            { "Category": "Semester Type", "Value": SEMESTER_TYPES.find(st => st.value === departmentLoadData.semesterType)?.label || departmentLoadData.semesterType },
            { "Category": "Calculated Semester Number", "Value": departmentLoadData.calculatedSemester },
            { "Category": "", "Value": ""},
            { "Category": "Total Allocated Theory Load", "Value": `${departmentLoadData.totalDepartmentTheoryLoad} hrs` },
            { "Category": "Total Allocated Practical Load", "Value": `${departmentLoadData.totalDepartmentPracticalLoad} hrs` },
            { "Category": "Grand Total Allocated Load", "Value": `${departmentLoadData.grandTotalDepartmentLoad} hrs` },
            { "Category": "", "Value": ""},
            { "Category": "Remaining Theory Load (Unallocated)", "Value": `${departmentLoadData.remainingLoadDetails?.theory || 0} hrs` },
            { "Category": "Remaining Practical Load (Unallocated)", "Value": `${departmentLoadData.remainingLoadDetails?.practical || 0} hrs` },
            { "Category": "Total Remaining Load", "Value": `${departmentLoadData.remainingLoadTotal || 0} hrs` },
            { "Category": "", "Value": ""}, // Added for spacing
            { "Category": `External Faculties Teaching in ${departmentLoadData.departmentName}`, "Value": departmentLoadData.externalFacultyCount || 0 },
        ];

        if (departmentLoadData.externalFacultyDetails && departmentLoadData.externalFacultyDetails.length > 0) {
            dataToExport.push({ "Category": "--- External Faculty Details ---", "Value": "" });
            departmentLoadData.externalFacultyDetails.forEach(faculty => {
                dataToExport.push({ "Category": `Faculty: ${faculty.facultyName} (${faculty.facultyUniqueId || 'N/A'})`, "Value": `Home Dept: ${faculty.facultyDepartmentName}` });
                faculty.allocationsInThisDept.forEach(alloc => {
                     dataToExport.push({ "Category": `  - Subject: ${alloc.subjectName} (${alloc.subjectCode})`, "Value": `Type: ${alloc.allocationType}, For: ${alloc.divisionName}${alloc.batchName ? ` (${alloc.batchName})` : ''}` });
                });
            });
        }


        const worksheet = XLSX.utils.json_to_sheet(dataToExport, {skipHeader: true});
        worksheet['!cols'] = [{wch: 50}, {wch: 40}]; // Adjusted column widths

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "DepartmentLoad");
        XLSX.writeFile(workbook, `DepartmentLoad_${departmentLoadData.departmentName.replace(/ /g, '_')}_${currentYearLabel.replace(/ /g, '_')}_${currentSemesterTypeLabel}.xlsx`);
        setSuccessMessage("Department load data exported successfully!");
    };


    const inputStyle = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 disabled:opacity-70";
    const labelStyle = "block text-sm font-medium text-gray-700 dark:text-gray-300";
    const buttonPrimaryStyle = "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 dark:focus:ring-offset-gray-800 disabled:opacity-50";
    const buttonExcelStyle = "px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-green-500 dark:focus:ring-offset-gray-800 disabled:opacity-50";
    const tableHeaderStyle = "px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider bg-gray-50 dark:bg-gray-700/70 sticky top-0 z-10";
    const tableCellStyle = "px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300";
    const tableCellNumericStyle = `${tableCellStyle} text-center`;
    const inputStyleSmall = "w-24 p-1 border border-gray-300 dark:border-gray-500 rounded-md text-center bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 focus:ring-indigo-500 focus:border-indigo-500 dark:focus:border-indigo-400 dark:placeholder-gray-400 disabled:bg-gray-200 dark:disabled:bg-gray-600";


    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">
                Load Calculation
            </h1>

            <section className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg shadow border dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Filters</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    <div>
                        <label htmlFor="departmentId" className={labelStyle}>Department*</label>
                        <select name="departmentId" id="departmentId" value={filters.departmentId} onChange={handleFilterChange} required className={inputStyle} disabled={isLoadingDepartments || !!globalSelectedDepartment}>
                            <option value="">-- Select Department --</option>
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        {!!globalSelectedDepartment && <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">Using global: {globalSelectedDepartment.name}</p>}
                    </div>
                    <div>
                        <label htmlFor="year" className={labelStyle}>Year Level*</label>
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
                    {viewType === 'faculty' && (
                        <div>
                            <label htmlFor="facultyDesignation" className={labelStyle}>Faculty Designation</label>
                            <select name="facultyDesignation" id="facultyDesignation" value={filters.facultyDesignation} onChange={handleFilterChange} className={inputStyle}>
                                {FACULTY_DESIGNATIONS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                    )}
                    {viewType === 'subject' && (
                        <>
                            <div>
                                <label htmlFor="subjectType" className={labelStyle}>Subject Type</label>
                                <select name="subjectType" id="subjectType" value={filters.subjectType} onChange={handleFilterChange} className={inputStyle}>
                                    {SUBJECT_TYPES_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="courseCategory" className={labelStyle}>Course Category</label>
                                <input type="text" name="courseCategory" id="courseCategory" value={filters.courseCategory} onChange={handleFilterChange} placeholder="e.g. PCC, DLO-AI" className={inputStyle} />
                            </div>
                        </>
                    )}
                </div>
                 <div className="flex justify-end">
                    <button onClick={fetchData} className={`${buttonPrimaryStyle} w-full md:w-auto`} disabled={isLoading || !filters.departmentId || !filters.year || !filters.semesterType}>
                        {isLoading ? 'Loading...' : 'View Load'}
                    </button>
                </div>
                 {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-300 p-3 mt-3 rounded-md text-sm whitespace-pre-wrap" role="alert">{error}</div>}
                 {successMessage && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-300 p-3 mt-3 rounded-md text-sm" role="alert">{successMessage}</div>}
            </section>

            <div className="mb-4 flex border-b border-gray-300 dark:border-gray-700">
                {['faculty', 'subject', 'department'].map(type => (
                    <button
                        key={type}
                        onClick={() => {
                            setViewType(type);
                            setFacultyLoadData([]);
                            setSubjectLoadData([]);
                            setDepartmentLoadData(null);
                            setAvgStudentCounts({});
                            setError('');
                            setSuccessMessage('');
                            setShowRemainingLoadDetails(false);
                            setShowExternalFacultyModal(false);
                        }}
                        className={`py-3 px-4 font-medium text-sm focus:outline-none transition-colors duration-150
                            ${viewType === type
                                ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                    >
                        {type.charAt(0).toUpperCase() + type.slice(1)} Load
                    </button>
                ))}
            </div>
            
            {isLoading && <div className="text-center py-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div><p className="mt-3 text-gray-600 dark:text-gray-300">Calculating and fetching load data...</p></div>}

            {!isLoading && filters.departmentId && filters.year && filters.semesterType && (
                <div className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-3 flex flex-col sm:flex-row justify-between items-center gap-2">
                    <span>Load for: {academicContextDisplay}</span>
                    <div className="flex flex-wrap gap-2">
                        {viewType === 'faculty' && facultyLoadData.length > 0 && <button onClick={handleExportFacultyLoad} className={buttonExcelStyle}>Export Faculty Load</button>}
                        {viewType === 'subject' && subjectLoadData.length > 0 &&
                            <>
                                {isAdmin && (
                                    <button onClick={handleSaveAvgStudentCounts} className={`${buttonPrimaryStyle} bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800`} disabled={isSavingAvgCounts || Object.keys(avgStudentCounts).length === 0}>
                                        {isSavingAvgCounts ? "Saving..." : "Save Avg. Counts"}
                                    </button>
                                )}
                                <button onClick={handleExportSubjectLoad} className={buttonExcelStyle}>Export Subject Load</button>
                            </>
                        }
                        {viewType === 'department' && departmentLoadData && <button onClick={handleExportDepartmentLoad} className={buttonExcelStyle}>Export Department Load</button>}
                    </div>
                </div>
            )}

            {viewType === 'department' && !isLoading && departmentLoadData && (
                <div className="p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg border dark:border-gray-700">
                    <h3 className="text-xl font-semibold mb-3 text-indigo-600 dark:text-indigo-400">{departmentLoadData.departmentName} - Load Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* ... existing summary cards ... */}
                        <div className="p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Total Allocated Theory Load</p>
                            <p className="text-2xl font-bold text-gray-800 dark:text-white">{departmentLoadData.totalDepartmentTheoryLoad} hrs</p>
                        </div>
                        <div className="p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Total Allocated Practical Load</p>
                            <p className="text-2xl font-bold text-gray-800 dark:text-white">{departmentLoadData.totalDepartmentPracticalLoad} hrs</p>
                        </div>
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                            <p className="text-sm text-blue-500 dark:text-blue-300">Grand Total Allocated Load</p>
                            <p className="text-2xl font-bold text-blue-700 dark:text-blue-200">{departmentLoadData.grandTotalDepartmentLoad} hrs</p>
                        </div>
                        <div className="p-3 bg-yellow-100 dark:bg-yellow-900/40 rounded-lg cursor-pointer hover:shadow-lg" onClick={() => setShowRemainingLoadDetails(!showRemainingLoadDetails)}>
                            <p className="text-sm text-yellow-600 dark:text-yellow-300">Total Remaining Load (Unallocated)</p>
                            <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-200">{departmentLoadData.remainingLoadTotal || 0} hrs</p>
                            <p className="text-xs text-yellow-500 dark:text-yellow-400">Theory: {departmentLoadData.remainingLoadDetails?.theory || 0} hrs, Practical: {departmentLoadData.remainingLoadDetails?.practical || 0} hrs</p>
                            <p className="text-xxs text-yellow-500 dark:text-yellow-400 mt-1">{showRemainingLoadDetails ? 'Hide Details' : 'Click to Show Details'}</p>
                        </div>
                         {/* New Card/Section for External Faculty */}
                        <div className="p-3 bg-purple-100 dark:bg-purple-900/40 rounded-lg md:col-span-2 lg:col-span-4">
                            <p className="text-sm text-purple-600 dark:text-purple-300">External Faculties Teaching in This Dept.</p>
                            <p className="text-2xl font-bold text-purple-700 dark:text-purple-200">
                                {departmentLoadData.externalFacultyCount || 0}
                            </p>
                            {departmentLoadData.externalFacultyCount > 0 && (
                                <button 
                                    onClick={() => setShowExternalFacultyModal(true)} 
                                    className="text-xs text-purple-500 dark:text-purple-400 hover:underline mt-1 focus:outline-none"
                                >
                                    View Details
                                </button>
                            )}
                        </div>
                    </div>
                    {showRemainingLoadDetails && departmentLoadData.remainingLoadDetails && (
                        <div className="mt-4 p-3 bg-yellow-50 dark:bg-gray-700/30 rounded-md border border-yellow-300 dark:border-yellow-600">
                            <h4 className="text-md font-semibold text-yellow-800 dark:text-yellow-200 mb-2">Details of Unallocated Load:</h4>
                            {departmentLoadData.remainingLoadDetails.components?.length > 0 ? (
                                <ul className="list-disc list-inside text-sm text-yellow-700 dark:text-yellow-300 max-h-60 overflow-y-auto space-y-1">
                                    {departmentLoadData.remainingLoadDetails.components.map((comp, index) => (
                                        <li key={index}>
                                            <strong>{comp.subjectName}</strong> ({comp.subjectCode}) - {comp.type} for <em>{comp.unitName}</em>: {comp.hours} hrs
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-yellow-600 dark:text-yellow-400 italic">No specific unallocated components found, or all load is allocated.</p>
                            )}
                        </div>
                    )}
                </div>
            )}
             {viewType === 'department' && !isLoading && !departmentLoadData && filters.departmentId && filters.year && filters.semesterType && !error && (
                <p className="text-center py-5 text-gray-600 dark:text-gray-400">No department load data to display. Ensure allocations are made for the selected criteria.</p>
            )}


            {viewType === 'faculty' && !isLoading && facultyLoadData.length > 0 && (
                <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow-md rounded-lg border dark:border-gray-700">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead >
                            <tr>
                                <th className={tableHeaderStyle}>Sr.No.</th>
                                <th className={tableHeaderStyle}>Faculty Name (ID)</th>
                                <th className={tableHeaderStyle}>Faculty Dept.</th>
                                <th className={tableHeaderStyle}>Designation</th>
                                <th className={tableHeaderStyle}>Subject Name (Code)</th>
                                <th className={tableHeaderStyle}>Subject Dept.</th>
                                <th className={tableCellNumericStyle}>TH (Base)</th>
                                <th className={tableCellNumericStyle}>PR (Base)</th>
                                <th className={tableCellNumericStyle}>Theory Divs</th>
                                <th className={tableCellNumericStyle}>Lab Units</th>
                                <th className={tableCellNumericStyle}>Engaged PR Hrs</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {facultyLoadData.map((faculty, facultyIndex) => (
                                <React.Fragment key={faculty.facultyId}>
                                    {faculty.subjects.length > 0 ? faculty.subjects.map((subject, subjectIndex) => (
                                        <tr key={`${faculty.facultyId}-${subject.subjectId}`} className={subjectIndex % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-700/30"}>
                                            {subjectIndex === 0 && (
                                                <td rowSpan={faculty.subjects.length || 1} className={`${tableCellStyle} align-top text-center border-r dark:border-gray-600`}>{facultyIndex + 1}</td>
                                            )}
                                            {subjectIndex === 0 && (
                                                <td rowSpan={faculty.subjects.length || 1} className={`${tableCellStyle} align-top font-medium border-r dark:border-gray-600`}>
                                                    {faculty.facultyName} ({faculty.facultyUniqueId})
                                                </td>
                                            )}
                                            {subjectIndex === 0 && (
                                                 <td rowSpan={faculty.subjects.length || 1} className={`${tableCellStyle} align-top border-r dark:border-gray-600`}>{faculty.departmentName}</td>
                                            )}
                                            {subjectIndex === 0 && (
                                                 <td rowSpan={faculty.subjects.length || 1} className={`${tableCellStyle} align-top border-r dark:border-gray-600`}>{formatDesignationEnum(faculty.facultyDesignation)}</td>
                                            )}
                                            <td className={tableCellStyle}>{subject.subjectName} ({subject.subjectCode})</td>
                                            <td className={`${tableCellStyle} text-xs`}>{subject.subjectDepartmentName}</td>
                                            <td className={tableCellNumericStyle}>{subject.baseTheoryHours > 0 ? subject.baseTheoryHours : '-'}</td>
                                            <td className={tableCellNumericStyle}>{subject.basePracticalHours > 0 ? subject.basePracticalHours : '-'}</td>
                                            <td className={tableCellNumericStyle}>{subject.theoryAllocationsCount > 0 ? subject.theoryAllocationsCount : '-'}</td>
                                            <td className={tableCellNumericStyle}>{subject.labUnitsCount > 0 ? subject.labUnitsCount : '-'}</td>
                                            <td className={tableCellNumericStyle}>{subject.basePracticalHours > 0 && subject.labUnitsCount > 0 ? (subject.basePracticalHours * subject.labUnitsCount) : '-'}</td>
                                        </tr>
                                    )) : (
                                         <tr key={`${faculty.facultyId}-no-subjects`} className="bg-gray-50 dark:bg-gray-700/30">
                                            <td className={`${tableCellStyle} text-center border-r dark:border-gray-600`}>{facultyIndex + 1}</td>
                                            <td className={`${tableCellStyle} font-medium border-r dark:border-gray-600`}>{faculty.facultyName} ({faculty.facultyUniqueId})</td>
                                            <td className={`${tableCellStyle} border-r dark:border-gray-600`}>{faculty.departmentName}</td>
                                            <td className={`${tableCellStyle} border-r dark:border-gray-600`}>{formatDesignationEnum(faculty.facultyDesignation)}</td>
                                            <td className={tableCellStyle} colSpan="7">No load allocated for the selected criteria.</td>
                                        </tr>
                                    )}
                                    {faculty.subjects.length > 0 && (
                                        <tr className="bg-gray-100 dark:bg-gray-700/50 font-semibold">
                                            <td colSpan="4" className="border-r dark:border-gray-600"></td>
                                            <td colSpan="2" className={`${tableCellStyle} text-right text-gray-600 dark:text-gray-300 pr-4`}>Faculty Totals:</td>
                                            <td className={`${tableCellNumericStyle} text-gray-600 dark:text-gray-300`}>{faculty.totalTheoryHoursFaculty} (Eng. TH)</td>
                                            <td className={tableCellNumericStyle}></td>
                                            <td className={`${tableCellNumericStyle} text-gray-600 dark:text-gray-300`}>{faculty.totalPracticalHoursFaculty} (Eng. PR)</td>
                                            <td className={tableCellNumericStyle}></td>
                                            <td className={`${tableCellNumericStyle} text-gray-600 dark:text-gray-300`}>{faculty.grandTotalLoad} (Total)</td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                         {designationSummary && (
                            <tfoot className="border-t-2 border-gray-300 dark:border-gray-600">
                                <tr className="bg-gray-200 dark:bg-gray-700/80">
                                    <td colSpan="11" className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Designation Summary:</td>
                                </tr>
                                {Object.values(designationSummary).filter(s => s.label !== 'Department Total' && s.count > 0).map(summaryItem => (
                                    <tr key={summaryItem.label} className="bg-gray-100 dark:bg-gray-700/50">
                                        <td colSpan="3" className={`${tableCellStyle} font-medium`}>{summaryItem.label}</td>
                                        <td className={tableCellStyle} >{summaryItem.count} Faculty</td>
                                        <td colSpan="6" className={tableCellStyle}></td>
                                        <td className={`${tableCellNumericStyle} font-semibold`}>{summaryItem.totalLoad} hrs</td>
                                    </tr>
                                ))}
                                <tr className="bg-gray-200 dark:bg-gray-700/80 font-bold">
                                    <td colSpan="3" className={`${tableCellStyle}`}>{designationSummary.Overall.label}</td>
                                    <td className={tableCellStyle}>{designationSummary.Overall.count} Faculty</td>
                                    <td colSpan="6" className={tableCellStyle}></td>
                                    <td className={`${tableCellNumericStyle}`}>{designationSummary.Overall.totalLoad} hrs</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            )}
             {viewType === 'faculty' && !isLoading && facultyLoadData.length === 0 && filters.departmentId && filters.year && filters.semesterType && !error && (
                <p className="text-center py-5 text-gray-600 dark:text-gray-400">No faculty load data found for the selected criteria.</p>
            )}


            {viewType === 'subject' && !isLoading && subjectLoadData.length > 0 && (
                <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow-md rounded-lg border dark:border-gray-700">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead>
                            <tr>
                                <th className={tableHeaderStyle}>Sr.No.</th>
                                <th className={tableHeaderStyle}>Subject (Code)</th>
                                <th className={tableCellNumericStyle}>Year</th>
                                <th className={tableCellNumericStyle}>TH (Base)</th>
                                <th className={tableCellNumericStyle}>Theory Divs</th>
                                <th className={tableCellNumericStyle}>Total Theory Hrs</th>
                                <th className={tableCellNumericStyle}>PR (Base)</th>
                                <th className={tableCellNumericStyle}>Lab Units</th>
                                <th className={tableCellNumericStyle}>Total PR Hrs</th>
                                <th className={tableCellNumericStyle}>Overall Load</th>
                                <th className={tableCellNumericStyle}>Avg. Stud./Div</th>
                                <th className={tableCellNumericStyle}>Avg. Stud./Batch (Lab)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {subjectLoadData.map((subject, index) => (
                                <tr key={subject.subjectId} className={index % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-700/30"}>
                                    <td className={tableCellNumericStyle}>{index + 1}</td>
                                    <td className={tableCellStyle}>{subject.subjectName} ({subject.subjectCode})
                                        <div className="text-xs text-gray-400 dark:text-gray-500">{subject.subjectType} {subject.courseCategory ? `- ${subject.courseCategory}` : ''}</div>
                                    </td>
                                    <td className={tableCellNumericStyle}>{YEARS.find(y => y.value === subject.year)?.label || subject.year}</td>
                                    <td className={tableCellNumericStyle}>{subject.baseTheoryHours}</td>
                                    <td className={tableCellNumericStyle}>{subject.distinctDivisionsTheoryCount}</td>
                                    <td className={tableCellNumericStyle}>{subject.totalTheoryEngagementHours}</td>
                                    <td className={tableCellNumericStyle}>{subject.basePracticalHours}</td>
                                    <td className={tableCellNumericStyle}>{subject.totalPracticalUnits}</td>
                                    <td className={tableCellNumericStyle}>{subject.totalPracticalEngagementHours}</td>
                                    <td className={`${tableCellNumericStyle} font-semibold`}>{subject.overallTotalLoad}</td>
                                    <td className={tableCellStyle}>
                                        <input type="number"
                                               value={avgStudentCounts[subject.subjectId]?.division ?? ''}
                                               onChange={(e) => handleAvgStudentCountChange(subject.subjectId, 'division', e.target.value)}
                                               className={inputStyleSmall} placeholder="Avg" min="0"
                                               disabled={!isAdmin || isSavingAvgCounts}
                                        />
                                    </td>
                                    <td className={tableCellStyle}>
                                        <input type="number"
                                               value={avgStudentCounts[subject.subjectId]?.batch ?? ''}
                                               onChange={(e) => handleAvgStudentCountChange(subject.subjectId, 'batch', e.target.value)}
                                               className={inputStyleSmall} placeholder="Avg" min="0"
                                               disabled={!isAdmin || isSavingAvgCounts || subject.basePracticalHours === 0}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {viewType === 'subject' && !isLoading && subjectLoadData.length === 0 && filters.departmentId && filters.year && filters.semesterType && !error && (
                 <p className="text-center py-5 text-gray-600 dark:text-gray-400">No subject load data found for the selected criteria.</p>
            )}

            {/* External Faculty Details Modal */}
            {showExternalFacultyModal && departmentLoadData?.externalFacultyDetails && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                External Faculties Teaching in {departmentLoadData.departmentName}
                            </h3>
                            <button 
                                onClick={() => setShowExternalFacultyModal(false)} 
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-full"
                                aria-label="Close modal"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        {departmentLoadData.externalFacultyDetails.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-700">
                                        <tr>
                                            <th className={tableHeaderStyle}>Faculty Name (ID)</th>
                                            <th className={tableHeaderStyle}>Home Department</th>
                                            <th className={tableHeaderStyle}>Subject in {departmentLoadData.departmentName}</th>
                                            <th className={tableHeaderStyle}>Allocation Details</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        {departmentLoadData.externalFacultyDetails.map(faculty => (
                                            faculty.allocationsInThisDept.map((alloc, index) => (
                                                <tr key={`${faculty.facultyId}-${alloc.subjectId}-${index}`}>
                                                    {index === 0 && (
                                                        <td rowSpan={faculty.allocationsInThisDept.length} className={`${tableCellStyle} align-top border-r dark:border-gray-600`}>
                                                            {faculty.facultyName} ({faculty.facultyUniqueId || 'N/A'})
                                                        </td>
                                                    )}
                                                    {index === 0 && (
                                                        <td rowSpan={faculty.allocationsInThisDept.length} className={`${tableCellStyle} align-top border-r dark:border-gray-600`}>
                                                            {faculty.facultyDepartmentName}
                                                        </td>
                                                    )}
                                                    <td className={tableCellStyle}>{alloc.subjectName} ({alloc.subjectCode})</td>
                                                    <td className={tableCellStyle}>
                                                        Type: {alloc.allocationType} <br />
                                                        For: {alloc.divisionName} {alloc.batchName ? `(${alloc.batchName})` : ''}
                                                    </td>
                                                </tr>
                                            ))
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400">No external faculty details found.</p>
                        )}
                        <div className="mt-6 flex justify-end">
                            <button onClick={() => setShowExternalFacultyModal(false)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100 rounded-md text-sm font-medium">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

export default LoadCalculationPage;
