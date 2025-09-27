// File: client/src/pages/LoadAllocationPage.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
const SUBJECT_TYPES_ENUM = ['Common', 'DLO', 'ILOT', 'MajorMinor'];
const ALLOCATION_CATEGORY_OPTIONS = [
    { value: '', label: 'All Categories' },
    { value: 'Theory', label: 'Theory Only' },
    { value: 'Lab', label: 'Lab Only' },
];
const ELECTIVE_SUBJECT_TYPES_FOR_CUSTOM_LABS = ['DLO', 'ILOT', 'MajorMinor'];

const calculateSemesterNumber = (yearLevel, semesterType) => {
    if (!yearLevel || !semesterType) return null;
    const yearNum = parseInt(yearLevel);
    if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) return null;
    const semTypeLower = String(semesterType).toLowerCase();
    if (semTypeLower === 'odd') return yearNum * 2 - 1;
    if (semTypeLower === 'even') return yearNum * 2;
    return null;
};

const formatDesignation = (designationEnumString) => {
    if (!designationEnumString) return 'N/A';
    return designationEnumString.replace(/([A-Z])/g, ' $1').replace(/^ /, '').trim();
};

function LoadAllocationPage() {
    const { userInfo } = useAuth();
    const { departments, isLoadingDepartments, fetchDepartments: fetchContextDepartments, selectedDepartment: globalSelectedDepartment } = useDepartment();

    const [entryFilters, setEntryFilters] = useState({
        departmentId: '', year: '', semesterType: '',
        subjectType: '', courseCategory: '',
        allocationCategoryForEntry: '',
    });
    const [uiDataForEntry, setUiDataForEntry] = useState({ subjects: [], faculty: [], divisions: [], studentElectiveChoices: [], customLabGroupSets: [] });
    const [currentAllocations, setCurrentAllocations] = useState({});
    const [uniqueCourseCategoriesForEntry, setUniqueCourseCategoriesForEntry] = useState([]);
    const [pendingAllocationsWarning, setPendingAllocationsWarning] = useState([]);

    const [viewFilters, setViewFilters] = useState({
        departmentId: '', year: '', semesterType: '',
        subjectType: '', courseCategory: '', allocationCategory: '',
    });
    const [allocatedLoadsForView, setAllocatedLoadsForView] = useState([]);
    const [isLoadingViewData, setIsLoadingViewData] = useState(false);
    const [viewError, setViewError] = useState('');
    const [uniqueCourseCategoriesForView, setUniqueCourseCategoriesForView] = useState([]);

    const [isLoadingEntryData, setIsLoadingEntryData] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const fileInputRef = useRef(null);
    const [isUploadingExcel, setIsUploadingExcel] = useState(false);
    const [excelUploadStatus, setExcelUploadStatus] = useState({ message: '', errors: [], created: 0, updated: 0, deleted: 0, warnings: [] });

    const isAdmin = useMemo(() => userInfo?.role === 'Admin', [userInfo]);

    useEffect(() => {
        const deptId = globalSelectedDepartment ? globalSelectedDepartment.id.toString() : '';
        setEntryFilters(prev => ({ ...prev, departmentId: deptId, year: '', semesterType: '', subjectType: '', courseCategory: '', allocationCategoryForEntry: '' }));
        setViewFilters(prev => ({ ...prev, departmentId: deptId, year: '', semesterType: '', subjectType: '', courseCategory: '', allocationCategory: '' }));
    }, [globalSelectedDepartment]);

    useEffect(() => {
        if (departments.length === 0 && !isLoadingDepartments) fetchContextDepartments();
    }, [departments.length, isLoadingDepartments, fetchContextDepartments]);

    const getRelevantDivisionsForTheory = useCallback((subject, allDivisionsInContext) => {
        if (!allDivisionsInContext || !subject) return [];
        if (subject.subjectType === 'Common') {
            return allDivisionsInContext.filter(d => d.divisionType === 'Permanent' && (d.linkedSubjectType === 'Common' || !d.linkedSubjectType));
        } else if (subject.subjectType === 'DLO' || subject.subjectType === 'ILOT') {
            return allDivisionsInContext.filter(d => d.divisionType === 'Temporary' && d.linkedSubjectType === subject.subjectType && d.courseCategory === subject.courseCategory);
        } else if (subject.subjectType === 'MajorMinor') {
            return allDivisionsInContext.filter(d => d.divisionType === 'Permanent' && d.linkedSubjectType === 'MajorMinor' && d.courseCategory === subject.courseCategory);
        }
        return [];
    }, []);

    const getRelevantLabUnits = useCallback((subject, allDivisionsInContext, allCustomLabGroupSetsInContext, studentElectiveChoices) => {
        if (!allDivisionsInContext || !subject || !subject.departmentId || !subject.year || !subject.semester) return [];
        let relevantUnits = [];
    
        const applicableCustomLabSet = (allCustomLabGroupSetsInContext || []).find(cgls =>
            cgls.departmentId === subject.departmentId &&
            cgls.year === subject.year &&
            cgls.semester === subject.semester &&
            cgls.linkedSubjectType === subject.subjectType &&
            cgls.courseCategory === subject.courseCategory
        );
    
        if (applicableCustomLabSet && ELECTIVE_SUBJECT_TYPES_FOR_CUSTOM_LABS.includes(subject.subjectType)) {
            (applicableCustomLabSet.customLabBatches || []).forEach(clb => {
                const composedBatchNames = (clb.composedOfPermanentBatches || [])
                    .map(b => `${b.name}(${b.permanentDivision?.name || '?'})`)
                    .join('+') || 'No base batches';
                
                // Find the Temporary Division this custom lab group "belongs" to (contextually)
                const contextualDivision = allDivisionsInContext.find(div => 
                    div.divisionType === 'Temporary' && // Ensure it's a temporary division
                    div.departmentId === applicableCustomLabSet.departmentId &&
                    div.year === applicableCustomLabSet.year &&
                    div.semester === applicableCustomLabSet.semester &&
                    div.linkedSubjectType === applicableCustomLabSet.linkedSubjectType &&
                    div.courseCategory === applicableCustomLabSet.courseCategory
                );
    
                relevantUnits.push({
                    id: clb.id, 
                    name: `${clb.name} [${composedBatchNames}]`,
                    // Use the ID of the temporary division if found, otherwise, this custom lab group might be orphaned or for a broader context not tied to a single temp division instance shown.
                    // For allocation, the key is that this CustomLabBatch ID is unique.
                    divisionId: contextualDivision ? contextualDivision.id : applicableCustomLabSet.id, // Using set ID as a fallback context identifier
                    divisionName: contextualDivision ? contextualDivision.name : `Set: ${applicableCustomLabSet.courseCategory}`,
                    isCustomGroup: true,
                });
            });
        } else { // No applicable custom set, or not an elective type that uses them (e.g., Common)
            allDivisionsInContext.forEach(division => {
                if (division.divisionType === 'Permanent') {
                    // For Common subjects, only consider Permanent divisions linked to Common (or unlinked)
                    if (subject.subjectType === 'Common' && (division.linkedSubjectType === 'Common' || !division.linkedSubjectType)) {
                        (division.batches || []).forEach(batch => {
                            relevantUnits.push({
                                id: batch.id, name: batch.name, divisionId: division.id,
                                divisionName: division.name, isCustomGroup: false,
                                originalPermanentDivisionName: division.name
                            });
                        });
                    } 
                    // For MajorMinor subjects, only consider Permanent divisions specifically linked to MajorMinor AND matching the course category
                    else if (subject.subjectType === 'MajorMinor' &&
                               division.linkedSubjectType === 'MajorMinor' &&
                               division.courseCategory === subject.courseCategory) {
                        (division.batches || []).forEach(batch => {
                            relevantUnits.push({
                                id: batch.id, name: batch.name, divisionId: division.id,
                                divisionName: division.name, isCustomGroup: false,
                                originalPermanentDivisionName: division.name
                            });
                        });
                    }
                } else if (division.divisionType === 'Temporary' && !applicableCustomLabSet) { 
                    // This case is for DLO/ILOT where NO custom lab set was defined for the subject's specific context.
                    // Labs are then for original permanent batches that are part of this temp division's theory composition AND opted for the subject.
                    if ((subject.subjectType === 'DLO' || subject.subjectType === 'ILOT') &&
                        division.linkedSubjectType === subject.subjectType &&
                        division.courseCategory === subject.courseCategory) {
                        
                        (division.composedOfPermanentBatches || []).forEach(permBatch => {
                            const studentChoiceExists = (studentElectiveChoices || []).find(
                                sec => sec.batchId === permBatch.id &&
                                       sec.subjectId === subject.id &&
                                       sec.studentCount > 0
                            );
                            if (studentChoiceExists) {
                                relevantUnits.push({
                                    id: permBatch.id, 
                                    name: `${permBatch.name} (${permBatch.permanentDivision?.name || '?'})`,
                                    divisionId: division.id, divisionName: division.name, isCustomGroup: false,
                                    originalPermanentDivisionName: permBatch.permanentDivision?.name
                                });
                            }
                        });
                    }
                }
            });
        }
        
        return Array.from(new Map(relevantUnits.map(item => [`${item.id}-${item.isCustomGroup}-${item.divisionId}`, item])).values())
            .sort((a, b) => {
                const divCompare = (a.divisionName || '').localeCompare(b.divisionName || '');
                if (divCompare !== 0) return divCompare;
                return (a.name || '').localeCompare(b.name || '');
            });
    }, []);

    const checkForPendingAllocations = useCallback((subjects, divisions, allCustomLabGroupSets, allocations, studentElectiveChoices) => {
        const warnings = [];
        if (!subjects || subjects.length === 0 || !divisions) {
            setPendingAllocationsWarning([]); return;
        }
        subjects.forEach(subject => {
            if (subject.theoryHours > 0 && (entryFilters.allocationCategoryForEntry === '' || entryFilters.allocationCategoryForEntry === 'Theory')) {
                const relevantTheoryDivisions = getRelevantDivisionsForTheory(subject, divisions);
                relevantTheoryDivisions.forEach(division => {
                    const key = `${subject.id}_${division.id}_null_Theory`;
                    if (!allocations[key]) warnings.push(`Theory: ${subject.name} (${subject.code}) for Div ${division.name} is unassigned.`);
                });
            }
            if (subject.practicalHours > 0 && (entryFilters.allocationCategoryForEntry === '' || entryFilters.allocationCategoryForEntry === 'Lab')) {
                const relevantLabUnits = getRelevantLabUnits(subject, divisions, allCustomLabGroupSets, studentElectiveChoices);
                relevantLabUnits.forEach(unit => {
                    const key = unit.isCustomGroup
                        ? `${subject.id}_${unit.divisionId}_null_${unit.id}_Lab`
                        : `${subject.id}_${unit.divisionId}_${unit.id}_Lab`;
                    if (!allocations[key]) warnings.push(`Lab: ${subject.name} (${subject.code}) for ${unit.name} (Context: ${unit.divisionName || 'N/A'}) is unassigned.`);
                });
            }
        });
        setPendingAllocationsWarning(warnings);
    }, [getRelevantDivisionsForTheory, getRelevantLabUnits, entryFilters.allocationCategoryForEntry]);

    const fetchDataForEntryUI = useCallback(async () => {
        if (!entryFilters.departmentId || !entryFilters.year || !entryFilters.semesterType) {
            setUiDataForEntry({ subjects: [], faculty: [], divisions: [], studentElectiveChoices: [], customLabGroupSets: [] });
            setCurrentAllocations({}); setUniqueCourseCategoriesForEntry([]); setPendingAllocationsWarning([]);
            return;
        }
        setIsLoadingEntryData(true); setError(''); setSuccessMessage(''); setPendingAllocationsWarning([]);
        const token = localStorage.getItem('authToken');
        if (!token) { setError('Authentication required.'); setIsLoadingEntryData(false); return; }

        try {
            const uiDataResponse = await axios.get(`${API_BASE_URL}/load-allocations/data-for-ui`, {
                params: { 
                    departmentId: entryFilters.departmentId,
                    year: entryFilters.year,
                    semesterType: entryFilters.semesterType,
                    subjectType: entryFilters.subjectType, 
                    courseCategory: entryFilters.courseCategory,
                }, 
                headers: { Authorization: `Bearer ${token}` },
            });
            const fetchedUiData = uiDataResponse.data;
            setUiDataForEntry(fetchedUiData);

            const categories = [...new Set(fetchedUiData.subjects.map(s => s.courseCategory).filter(Boolean))].sort();
            setUniqueCourseCategoriesForEntry(categories);

            const existingAllocParams = {
                departmentId: entryFilters.departmentId,
                year: entryFilters.year,
                semesterType: entryFilters.semesterType,
            };
            const existingAllocationsResponse = await axios.get(`${API_BASE_URL}/load-allocations`, {
                params: existingAllocParams, headers: { Authorization: `Bearer ${token}` },
            });
            const fetchedAllocations = existingAllocationsResponse.data || [];
            const newCurrentAllocations = {};
            fetchedAllocations.forEach(alloc => { 
                const key = alloc.customLabBatch // Use customLabBatch from include
                    ? `${alloc.subjectId}_${alloc.divisionId}_null_${alloc.customLabBatch.id}_Lab` // Use customLabBatch.id
                    : `${alloc.subjectId}_${alloc.divisionId}_${alloc.batchId || 'null'}_${alloc.allocationType}`;
                newCurrentAllocations[key] = alloc.facultyId;
            });
            setCurrentAllocations(newCurrentAllocations);
            checkForPendingAllocations(fetchedUiData.subjects, fetchedUiData.divisions, fetchedUiData.customLabGroupSets, newCurrentAllocations, fetchedUiData.studentElectiveChoices);

        } catch (err) { 
            console.error("Fetch Data for Load Allocation Entry Error:", err);
            setError(err.response?.data?.message || 'Failed to fetch data for allocation entry.');
            setUiDataForEntry({ subjects: [], faculty: [], divisions: [], studentElectiveChoices: [], customLabGroupSets: [] });
            setCurrentAllocations({}); setUniqueCourseCategoriesForEntry([]); setPendingAllocationsWarning([]);
        } 
        finally { setIsLoadingEntryData(false); }
    }, [entryFilters, checkForPendingAllocations]);

    useEffect(() => { fetchDataForEntryUI(); }, [fetchDataForEntryUI]);

    const fetchAllocatedLoadsForView = useCallback(async () => {
        if (!viewFilters.departmentId || !viewFilters.year || !viewFilters.semesterType) {
            setAllocatedLoadsForView([]); setUniqueCourseCategoriesForView([]); return;
        }
        setIsLoadingViewData(true); setViewError(''); const token = localStorage.getItem('authToken');
        if (!token) { setViewError('Authentication required.'); setIsLoadingViewData(false); return; }
        try {
            const calculatedSemesterForSubjectFilter = calculateSemesterNumber(viewFilters.year, viewFilters.semesterType);
            const subjectParams = { departmentId: viewFilters.departmentId };
            if (viewFilters.year && calculatedSemesterForSubjectFilter) {
                subjectParams.year = viewFilters.year; subjectParams.semester = calculatedSemesterForSubjectFilter;
            }
            if (viewFilters.subjectType) subjectParams.subjectType = viewFilters.subjectType;
            if (viewFilters.departmentId && viewFilters.year && viewFilters.semesterType && calculatedSemesterForSubjectFilter) {
                const subjectsForViewFilterResponse = await axios.get(`${API_BASE_URL}/subjects`, { params: subjectParams, headers: { Authorization: `Bearer ${token}` } });
                const categories = [...new Set(subjectsForViewFilterResponse.data.map(s => s.courseCategory).filter(Boolean))].sort();
                setUniqueCourseCategoriesForView(categories);
            } else if (!viewFilters.year || !viewFilters.semesterType) { setUniqueCourseCategoriesForView([]); }
            const paramsToView = { departmentId: viewFilters.departmentId, year: viewFilters.year, semesterType: viewFilters.semesterType, };
            if (viewFilters.subjectType) paramsToView.subjectType = viewFilters.subjectType;
            if (viewFilters.courseCategory) paramsToView.courseCategory = viewFilters.courseCategory;
            if (viewFilters.allocationCategory) paramsToView.allocationType = viewFilters.allocationCategory;
            const response = await axios.get(`${API_BASE_URL}/load-allocations`, { params: paramsToView, headers: { Authorization: `Bearer ${token}` } });
            setAllocatedLoadsForView(response.data || []);
        } catch (err) { setViewError(err.response?.data?.message || 'Failed to fetch allocated loads for viewing.'); setAllocatedLoadsForView([]); } 
        finally { setIsLoadingViewData(false); }
    }, [viewFilters]);

    useEffect(() => { fetchAllocatedLoadsForView(); }, [fetchAllocatedLoadsForView]);

    const handleEntryFilterChange = (e) => {
        const { name, value } = e.target;
        setEntryFilters(prev => {
            const newFilters = { ...prev, [name]: value };
            if (name === "subjectType" || name === "allocationCategoryForEntry") { newFilters.courseCategory = ''; }
            return newFilters;
        });
        setError(''); setSuccessMessage('');
    };

    const handleViewFilterChange = (e) => {
        const { name, value } = e.target;
        setViewFilters(prev => {
            const newFilters = { ...prev, [name]: value };
            if (name === "subjectType") { newFilters.courseCategory = ''; }
            return newFilters;
        });
        setViewError('');
    };

    const handleFacultySelectionChange = (subjectId, divisionId, unitId, allocationType, facultyId, isCustomGroup = false) => {
        const key = isCustomGroup
            ? `${subjectId}_${divisionId}_null_${unitId}_Lab` 
            : `${subjectId}_${divisionId}_${unitId || 'null'}_${allocationType}`; 
        setCurrentAllocations(prev => ({ ...prev, [key]: facultyId ? parseInt(facultyId) : null }));
    };

    const handleSaveChanges = async () => { 
        setIsSaving(true); setError(''); setSuccessMessage(''); const token = localStorage.getItem('authToken');
        const payloadAllocations = Object.entries(currentAllocations).map(([key, facultyId]) => {
            const parts = key.split('_'); const subjectId = parseInt(parts[0]); const divisionId = parseInt(parts[1]);
            let batchId = null; let customLabBatchGroupId = null; let allocationType = '';
            if (parts.length === 4 && parts[3] === 'Theory') { allocationType = 'Theory'; } 
            else if (parts.length === 4 && parts[3] === 'Lab') { allocationType = 'Lab'; batchId = parts[2] === 'null' ? null : parseInt(parts[2]); } 
            else if (parts.length === 5 && parts[4] === 'Lab') { allocationType = 'Lab'; customLabBatchGroupId = parseInt(parts[3]); } 
            else { console.error("Error parsing allocation key:", key); setError("Internal error parsing allocation key."); return null; }
            if (allocationType === '') return null; 
            return { subjectId, divisionId, batchId, customLabBatchGroupId, allocationType, facultyId: facultyId ? parseInt(facultyId) : null, };
        }).filter(Boolean); 
        if (payloadAllocations.length === 0 && Object.keys(currentAllocations).length === 0) { setSuccessMessage("No allocations to save."); setIsSaving(false); return; }
        if (payloadAllocations.some(p => p === null)) { setIsSaving(false); return; }
        try {
            const response = await axios.post(`${API_BASE_URL}/load-allocations`, { allocations: payloadAllocations }, { headers: { Authorization: `Bearer ${token}` } });
            setSuccessMessage(response.data.message || 'Load allocations saved!'); fetchDataForEntryUI(); fetchAllocatedLoadsForView();
        } catch (err) { setError(err.response?.data?.message || 'Failed to save.'); if (err.response?.data?.errors) { setError(`Save failed. Errors: ${err.response.data.errors.map(e => `Item ${e.index + 1}: ${e.message}`).join('; ')}`); }} 
        finally { setIsSaving(false); }
    };
    
    const renderAllocationGrid = () => {
        const { subjects, divisions, faculty, studentElectiveChoices, customLabGroupSets } = uiDataForEntry;
        if (subjects.length === 0 && !isLoadingEntryData) { return <p className="text-center text-gray-500 dark:text-gray-400 py-5">No subjects loaded. Adjust filters or define subjects in Subject Management.</p>; }
        
        const filteredSubjects = subjects.filter(subject => {
            if (entryFilters.allocationCategoryForEntry === 'Theory') return subject.theoryHours > 0;
            if (entryFilters.allocationCategoryForEntry === 'Lab') return subject.practicalHours > 0;
            return true;
        });

        if (filteredSubjects.length === 0 && entryFilters.allocationCategoryForEntry && !isLoadingEntryData) {
            return <p className="text-center text-gray-500 dark:text-gray-400 py-5">No subjects found with {entryFilters.allocationCategoryForEntry.toLowerCase()} hours for the selected criteria.</p>;
        }
        if (filteredSubjects.length === 0 && !isLoadingEntryData) {
             return <p className="text-center text-gray-500 dark:text-gray-400 py-5">No subjects available for allocation based on current filters.</p>;
        }

        return filteredSubjects.map(subject => (
            <div key={subject.id} className="mb-8 p-4 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-300 dark:border-gray-600">
                <h4 className="text-lg font-semibold text-indigo-700 dark:text-indigo-300 mb-1">{subject.name} ({subject.code})</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Type: {subject.subjectType} | Category: {subject.courseCategory || 'N/A'} | TH: {subject.theoryHours}, PH: {subject.practicalHours}</p>

                {subject.theoryHours > 0 && (entryFilters.allocationCategoryForEntry === '' || entryFilters.allocationCategoryForEntry === 'Theory') && (
                    <div className="mb-4 pl-4 border-l-2 border-blue-500 dark:border-blue-400">
                        <h5 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-2">Theory Lectures</h5>
                        {getRelevantDivisionsForTheory(subject, divisions).map(division => (
                            <div key={`${subject.id}_${division.id}_null_Theory`} className="flex items-center space-x-2 mb-1 py-1 border-b border-gray-300 dark:border-gray-600 last:border-b-0">
                                <span className="text-sm w-1/3 text-gray-600 dark:text-gray-400">{division.name} ({division.divisionType})</span>
                                <select value={currentAllocations[`${subject.id}_${division.id}_null_Theory`] || ''} onChange={(e) => handleFacultySelectionChange(subject.id, division.id, null, 'Theory', e.target.value)} className={selectStyle} disabled={!isAdmin || isSaving} >
                                    <option value="" className="text-gray-500 dark:text-gray-400">-- Unassigned --</option>
                                    {faculty.map(f => (<option key={f.id} value={f.id} className="text-gray-900 dark:text-gray-100">{f.name} ({f.uniqueId || 'ID N/A'} - {f.department.name} - {formatDesignation(f.designation)})</option>))}
                                </select>
                            </div>
                        ))}
                        {getRelevantDivisionsForTheory(subject, divisions).length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500 italic">No applicable divisions for theory.</p>}
                    </div>
                )}

                {subject.practicalHours > 0 && (entryFilters.allocationCategoryForEntry === '' || entryFilters.allocationCategoryForEntry === 'Lab') && (
                    <div className="pl-4 border-l-2 border-green-500 dark:border-green-400">
                        <h5 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-2">Lab Sessions</h5>
                        {getRelevantLabUnits(subject, divisions, customLabGroupSets, studentElectiveChoices).map(unit => {
                            const key = unit.isCustomGroup
                                ? `${subject.id}_${unit.divisionId}_null_${unit.id}_Lab` 
                                : `${subject.id}_${unit.divisionId}_${unit.id}_Lab`;    
                            return (
                                <div key={key} className="flex items-center space-x-2 mb-1 py-1 border-b border-gray-300 dark:border-gray-600 last:border-b-0">
                                    <span className="text-sm w-1/3 text-gray-600 dark:text-gray-400" title={`Division Context: ${unit.divisionName || 'N/A'}`}>{unit.name} <span className="text-xxs">({unit.isCustomGroup ? 'Custom Lab' : 'Batch'})</span></span>
                                    <select value={currentAllocations[key] || ''} onChange={(e) => handleFacultySelectionChange(subject.id, unit.divisionId, unit.id, 'Lab', e.target.value, unit.isCustomGroup)} className={selectStyle} disabled={!isAdmin || isSaving} >
                                        <option value="" className="text-gray-500 dark:text-gray-400">-- Unassigned --</option>
                                        {faculty.map(f => (<option key={f.id} value={f.id} className="text-gray-900 dark:text-gray-100">{f.name} ({f.uniqueId || 'ID N/A'} - {f.department.name} - {formatDesignation(f.designation)})</option>))}
                                    </select>
                                </div>
                            );
                        })}
                        {getRelevantLabUnits(subject, divisions, customLabGroupSets, studentElectiveChoices).length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500 italic">No applicable batches or custom lab groups.</p>}
                    </div>
                )}
            </div>
        ));
    };

    const handleExportViewToExcel = () => { 
        if (allocatedLoadsForView.length === 0) { setViewError("No data to export."); return; }
        const dataToExport = allocatedLoadsForView.map(alloc => ({
            "Department": alloc.subject?.department?.name || alloc.division?.department?.name || globalSelectedDepartment?.name || 'N/A',
            "Subject Code": alloc.subject?.code || 'N/A', "Subject Name": alloc.subject?.name || 'N/A',
            "Subject Type": alloc.subject?.subjectType || 'N/A', "Course Category (Subject)": alloc.subject?.courseCategory || '-',
            "Allocation Category": alloc.allocationType, "Division Name": alloc.division?.name || 'N/A',
            "Division Type": alloc.division?.divisionType || 'N/A', "Course Category (Division)": alloc.division?.courseCategory || '-',
            "Batch/Custom Lab Group": alloc.customLabBatch ? `${alloc.customLabBatch.name} (Custom)` : (alloc.batch?.name || '-'),
            "Faculty Name": alloc.faculty?.name || 'Unassigned', "Faculty ID": alloc.faculty?.uniqueId || '-',
            "Faculty Department": alloc.faculty?.department?.name || '-', "Faculty Designation": alloc.faculty ? formatDesignation(alloc.faculty.designation) : '-',
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport); const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "AllocatedLoad");
        XLSX.writeFile(workbook, `AllocatedLoad_View_${new Date().toISOString().slice(0, 10)}.xlsx`);
        setSuccessMessage("Allocated load data exported to Excel successfully.");
    };

    const handleExcelFileImport = async (event) => { 
        const file = event.target.files[0]; if (!file) return;
        setIsUploadingExcel(true); setExcelUploadStatus({ message: 'Processing...', errors: [], created: 0, updated: 0, deleted: 0, warnings: [] });
        const token = localStorage.getItem('authToken'); const formData = new FormData(); formData.append('file', file);
        try {
            const response = await axios.post(`${API_BASE_URL}/load-allocations/upload-excel`, formData, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }, });
            setExcelUploadStatus({ message: response.data.message || "Excel import processed.", errors: response.data.errors || [], created: response.data.created || 0, updated: response.data.updated || 0, deleted: response.data.deleted || 0, warnings: response.data.warnings || [], });
            fetchDataForEntryUI(); fetchAllocatedLoadsForView(); 
        } catch (err) { 
            console.error("Load Allocation Excel Import Error:", err.response); 
            setExcelUploadStatus({ message: err.response?.data?.message || "Excel import failed.", errors: err.response?.data?.errors || [{ row: 'N/A', message: "General processing error." }], created: 0, updated: 0, deleted: 0, warnings: [] });
        } finally { setIsUploadingExcel(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
    };

    const inputStyle = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 disabled:opacity-70";
    const selectStyle = "form-select mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-70";
    const labelStyle = "block text-sm font-medium text-gray-700 dark:text-gray-300";
    const buttonPrimaryStyle = "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-50";
    const tableHeaderStyle = "px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider";
    const tableCellStyle = "px-3 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300";

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-8">
            <section>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white mb-6">
                    Load Allocation Entry {globalSelectedDepartment ? `(${globalSelectedDepartment.name})` : ''}
                </h1>
                {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-300 p-4 mb-4 rounded-md" role="alert"><button onClick={() => setError('')} className="float-right font-bold text-lg">&times;</button>{error}</div>}
                {successMessage && !viewError && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-300 p-4 mb-4 rounded-md" role="alert"><button onClick={() => setSuccessMessage('')} className="float-right font-bold text-lg">&times;</button>{successMessage}</div>}

                {isAdmin && (
                    <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg shadow border dark:border-gray-600">
                        <h3 className="text-lg font-medium mb-3 text-gray-700 dark:text-gray-200">Import Allocations from Excel</h3>
                        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                            <div className="flex-grow"><label htmlFor="load-alloc-excel-upload" className={labelStyle}>Upload Excel File (.xlsx, .xls)</label><input type="file" id="load-alloc-excel-upload" ref={fileInputRef} onChange={handleExcelFileImport} accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" className={`${inputStyle} p-1.5 text-sm file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-800 file:text-indigo-700 dark:file:text-indigo-200 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-700`} disabled={isUploadingExcel}/></div>
                            <button onClick={() => { if(fileInputRef.current?.files[0]) handleExcelFileImport({target: {files: [fileInputRef.current.files[0]]}}); else alert("Please select a file first.");}} className={`${buttonPrimaryStyle} mt-2 sm:mt-0 bg-purple-600 hover:bg-purple-700`} disabled={isUploadingExcel || !fileInputRef.current?.files[0]}>{isUploadingExcel ? 'Importing...' : 'Import File'}</button>
                        </div>
                        {excelUploadStatus.message && (<div className={`mt-3 p-2 rounded-md text-xs ${excelUploadStatus.errors.length > 0 ? 'bg-yellow-100 dark:bg-yellow-800/60 text-yellow-700 dark:text-yellow-200' : 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-200'}`}><p className="font-semibold">{excelUploadStatus.message}</p>{(excelUploadStatus.errors.length > 0 || excelUploadStatus.warnings.length > 0) && (<ul className="list-disc list-inside mt-1 max-h-24 overflow-y-auto">{excelUploadStatus.errors.map((err, idx) => <li key={`err-${idx}`} className="text-red-600 dark:text-red-400">Error (Row {err.row}): {err.message}</li>)}{excelUploadStatus.warnings.map((warn, idx) => <li key={`warn-${idx}`} className="text-yellow-700 dark:text-yellow-300">Warning (Row {warn.row}): {warn.message}</li>)}</ul>)}</div>)}
                    </div>
                )}

                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg shadow border border-gray-300 dark:border-gray-700">
                    <h3 className="text-lg font-medium mb-3 text-gray-700 dark:text-gray-200">Select Criteria to Allocate Load</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div><label htmlFor="deptFilterLA" className={labelStyle}>Department*</label><select name="departmentId" id="deptFilterLA" value={entryFilters.departmentId} onChange={handleEntryFilterChange} required className={selectStyle} disabled={isLoadingDepartments || !!globalSelectedDepartment}><option value="">-- Select --</option>{departments.map(dept => <option key={dept.id} value={dept.id} className="text-gray-900 dark:text-gray-100">{dept.name}</option>)}</select>{!!globalSelectedDepartment && <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">Global: {globalSelectedDepartment.name}</p>}</div>
                        <div><label htmlFor="yearFilterLA" className={labelStyle}>Year Level*</label><select name="year" id="yearFilterLA" value={entryFilters.year} onChange={handleEntryFilterChange} required className={selectStyle}><option value="">-- Select --</option>{YEARS.map(y => <option key={y.value} value={y.value} className="text-gray-900 dark:text-gray-100">{y.label}</option>)}</select></div>
                        <div><label htmlFor="semTypeFilterLA" className={labelStyle}>Semester Type*</label><select name="semesterType" id="semTypeFilterLA" value={entryFilters.semesterType} onChange={handleEntryFilterChange} required className={selectStyle}><option value="">-- Select --</option>{SEMESTER_TYPES.map(st => <option key={st.value} value={st.value} className="text-gray-900 dark:text-gray-100">{st.label}</option>)}</select></div>
                        <div><label htmlFor="subjectTypeFilterLA" className={labelStyle}>Subject Type</label><select name="subjectType" id="subjectTypeFilterLA" value={entryFilters.subjectType} onChange={handleEntryFilterChange} className={selectStyle}><option value="">All Types</option>{SUBJECT_TYPES_ENUM.map(st => <option key={st} value={st} className="text-gray-900 dark:text-gray-100">{st.replace(/([A-Z])/g, ' $1').trim()}</option>)}</select></div>
                        <div><label htmlFor="courseCategoryFilterLA" className={labelStyle}>Course Category</label><select name="courseCategory" id="courseCategoryFilterLA" value={entryFilters.courseCategory} onChange={handleEntryFilterChange} className={selectStyle} disabled={uniqueCourseCategoriesForEntry.length === 0 && entryFilters.subjectType !== ''}><option value="">All Categories</option>{uniqueCourseCategoriesForEntry.map(cat => <option key={cat} value={cat} className="text-gray-900 dark:text-gray-100">{cat}</option>)}</select></div>
                        <div>
                            <label htmlFor="allocationCategoryForEntry" className={labelStyle}>Allocation Focus</label>
                            <select name="allocationCategoryForEntry" id="allocationCategoryForEntry" value={entryFilters.allocationCategoryForEntry} onChange={handleEntryFilterChange} className={selectStyle}>
                                {ALLOCATION_CATEGORY_OPTIONS.map(opt => (<option key={`entry-${opt.value}`} value={opt.value} className="text-gray-900 dark:text-gray-100">{opt.label}</option>))}
                            </select>
                        </div>
                    </div>
                </div>

                {pendingAllocationsWarning.length > 0 && ( 
                    <div className="mb-4 p-3 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 dark:bg-yellow-700/30 dark:text-yellow-200 rounded-md text-sm">
                        <p className="font-semibold">Warning: The following allocations are pending:</p>
                        <ul className="list-disc list-inside max-h-32 overflow-y-auto mt-1">{pendingAllocationsWarning.map((warning, index) => (<li key={index}>{warning}</li>))}</ul>
                        <p className="mt-1 text-xs">You can still proceed to save current allocations.</p>
                    </div>
                )}
                {isLoadingEntryData && <p className="text-center text-gray-600 dark:text-gray-400 py-10">Loading allocation data...</p>}
                {!isLoadingEntryData && entryFilters.departmentId && entryFilters.year && entryFilters.semesterType && renderAllocationGrid()}
                {!isLoadingEntryData && isAdmin && uiDataForEntry.subjects.length > 0 && ( <div className="mt-8 flex justify-end"><button onClick={handleSaveChanges} className={buttonPrimaryStyle} disabled={isSaving || isLoadingEntryData || !isAdmin}>{isSaving ? 'Saving...' : 'Save Allocations'}</button></div>)}
            </section>

            <section className="mt-10 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg shadow border border-gray-300 dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">View Allocated Load</h2>
                {viewError && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-300 p-4 mb-4 rounded-md" role="alert"><button onClick={() => setViewError('')} className="float-right font-bold text-lg">&times;</button>{viewError}</div>}
                <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div><label htmlFor="viewDeptFilter" className={labelStyle}>Department</label><select name="departmentId" id="viewDeptFilter" value={viewFilters.departmentId} onChange={handleViewFilterChange} className={selectStyle} disabled={isLoadingDepartments || !!globalSelectedDepartment}><option value="">-- All --</option>{departments.map(dept => <option key={dept.id} value={dept.id} className="text-gray-900 dark:text-gray-100">{dept.name}</option>)}</select>{!!globalSelectedDepartment && <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">Global: {globalSelectedDepartment.name}</p>}</div>
                    <div><label htmlFor="viewYearFilter" className={labelStyle}>Year Level</label><select name="year" id="viewYearFilter" value={viewFilters.year} onChange={handleViewFilterChange} className={selectStyle}><option value="">-- All --</option>{YEARS.map(y => <option key={y.value} value={y.value} className="text-gray-900 dark:text-gray-100">{y.label}</option>)}</select></div>
                    <div><label htmlFor="viewSemTypeFilter" className={labelStyle}>Semester Type</label><select name="semesterType" id="viewSemTypeFilter" value={viewFilters.semesterType} onChange={handleViewFilterChange} className={selectStyle}><option value="">-- All --</option>{SEMESTER_TYPES.map(st => <option key={st.value} value={st.value} className="text-gray-900 dark:text-gray-100">{st.label}</option>)}</select></div>
                    <div><label htmlFor="viewSubjectTypeFilter" className={labelStyle}>Subject Type</label><select name="subjectType" id="viewSubjectTypeFilter" value={viewFilters.subjectType} onChange={handleViewFilterChange} className={selectStyle}><option value="">All Types</option>{SUBJECT_TYPES_ENUM.map(st => <option key={st} value={st} className="text-gray-900 dark:text-gray-100">{st.replace(/([A-Z])/g, ' $1').trim()}</option>)}</select></div>
                    <div><label htmlFor="viewCourseCategoryFilter" className={labelStyle}>Course Category</label><select name="courseCategory" id="viewCourseCategoryFilter" value={viewFilters.courseCategory} onChange={handleViewFilterChange} className={selectStyle} disabled={uniqueCourseCategoriesForView.length === 0 && viewFilters.subjectType !== ''}><option value="">All Categories</option>{uniqueCourseCategoriesForView.map(cat => <option key={cat} value={cat} className="text-gray-900 dark:text-gray-100">{cat}</option>)}</select></div>
                    <div><label htmlFor="viewAllocationCategoryFilter" className={labelStyle}>Allocation Category</label><select name="allocationCategory" id="viewAllocationCategoryFilter" value={viewFilters.allocationCategory} onChange={handleViewFilterChange} className={selectStyle}>{ALLOCATION_CATEGORY_OPTIONS.map(opt => <option key={`view-${opt.value}`} value={opt.value} className="text-gray-900 dark:text-gray-100">{opt.label}</option>)}</select></div>
                </div>
                <div className="flex justify-end mb-4"><button onClick={handleExportViewToExcel} className={`${buttonPrimaryStyle} bg-teal-600 hover:bg-teal-700 text-xs`} disabled={isLoadingViewData || allocatedLoadsForView.length === 0}>Export View to Excel</button></div>

                {isLoadingViewData && <p className="text-center text-gray-600 dark:text-gray-400 py-5">Loading allocated loads...</p>}
                {!isLoadingViewData && allocatedLoadsForView.length === 0 && viewFilters.departmentId && viewFilters.year && viewFilters.semesterType && (<p className="text-center text-gray-500 dark:text-gray-400 py-5">No allocated loads found for the selected view criteria.</p>)}
                {!isLoadingViewData && allocatedLoadsForView.length > 0 && (
                    <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow-md rounded-lg border border-gray-300 dark:border-gray-700">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-100 dark:bg-gray-700/70"><tr><th className={tableHeaderStyle}>Faculty (Dept - Designation)</th><th className={tableHeaderStyle}>Subject (Code)</th><th className={tableHeaderStyle}>Alloc. Category</th><th className={tableHeaderStyle}>Division (Type)</th><th className={tableHeaderStyle}>Batch/Custom Lab Group</th></tr></thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">{allocatedLoadsForView.map(alloc => (<tr key={alloc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50"><td className={tableCellStyle}>{alloc.faculty?.name || <span className="italic text-gray-500 dark:text-gray-400">Unassigned</span>}{alloc.faculty && <span className="text-xs text-gray-400 dark:text-gray-500"> ({alloc.faculty.department?.name || 'N/A Dept'} - {formatDesignation(alloc.faculty.designation)})</span>}</td><td className={tableCellStyle}>{alloc.subject.name} ({alloc.subject.code}) <div className="text-xs text-gray-400 dark:text-gray-500">{alloc.subject.subjectType}{alloc.subject.courseCategory ? ` - ${alloc.subject.courseCategory}` : ''}</div></td><td className={tableCellStyle}>{alloc.allocationType}</td><td className={tableCellStyle}>{alloc.division.name} <span className="text-xs text-gray-400 dark:text-gray-500">({alloc.division.divisionType})</span></td><td className={tableCellStyle}>{alloc.customLabBatch ? `${alloc.customLabBatch.name} (Custom Group)` : (alloc.batch?.name || <span className="italic text-gray-500 dark:text-gray-400">N/A (Theory)</span>)}</td></tr>))}</tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}

export default LoadAllocationPage;
