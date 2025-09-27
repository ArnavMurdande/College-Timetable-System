// File: client/src/pages/DivisionBatchManagementPage.jsx
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
const DIVISION_TYPES = [{value: 'Permanent', label: 'Permanent'}, {value: 'Temporary', label: 'Temporary'}];
const SUBJECT_TYPES_ENUM = ['Common', 'DLO', 'ILOT', 'MajorMinor'];
const ELECTIVE_SUBJECT_TYPES_FOR_CUSTOM_LABS = ['DLO', 'ILOT', 'MajorMinor'];

const formatSubjectType = (type) => {
    if (!type) return 'N/A';
    switch(type) {
        case 'MajorMinor': return 'Major/Minor';
        default: return type;
    }
};

const calculateSemester = (year, semesterType) => {
    if (!year || !semesterType) return null;
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) return null;
    if (String(semesterType).toLowerCase() === 'odd') return yearNum * 2 - 1;
    if (String(semesterType).toLowerCase() === 'even') return yearNum * 2;
    return null;
};


function DivisionBatchManagementPage() {
    const { userInfo } = useAuth();
    const { departments, isLoadingDepartments, fetchDepartments: fetchContextDepartments, selectedDepartment: globalSelectedDepartment } = useDepartment();

    const [divisions, setDivisions] = useState([]);
    const [isLoading, setIsLoading] = useState(false); 
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Division Form State
    const [showDivisionForm, setShowDivisionForm] = useState(false);
    const [isEditModeDivision, setIsEditModeDivision] = useState(false);
    const [currentDivisionId, setCurrentDivisionId] = useState(null);
    const [divisionFormData, setDivisionFormData] = useState({
        name: '', departmentId: '', year: '', semesterType: '',
        divisionType: DIVISION_TYPES[0].value,
        defaultBatchCount: 3, courseCategory: '',
        linkedSubjectType: '', permanentBatchIds: [],
    });
    const [divisionFormError, setDivisionFormError] = useState('');
    const [availablePermanentBatchesForTheory, setAvailablePermanentBatchesForTheory] = useState([]);
    const [isLoadingPermanentBatchesForTheory, setIsLoadingPermanentBatchesForTheory] = useState(false);

    // Custom Lab Group Set Modal State
    const [showCustomLabGroupModal, setShowCustomLabGroupModal] = useState(false);
    const [customLabSetFilters, setCustomLabSetFilters] = useState({
        departmentId: '', year: '', semesterType: '', linkedSubjectType: '', courseCategory: ''
    });
    const [editingCustomLabSet, setEditingCustomLabSet] = useState(null);
    const [customLabBatchDefinitions, setCustomLabBatchDefinitions] = useState([]);
    const [availableBatchesForCustomLabGroups, setAvailableBatchesForCustomLabGroups] = useState([]);
    const [isLoadingBatchesForCustomGroups, setIsLoadingBatchesForCustomGroups] = useState(false);
    const [customLabSetFormError, setCustomLabSetFormError] = useState('');
    const [isSavingCustomLabSet, setIsSavingCustomLabSet] = useState(false);
    const [allCustomLabGroupSets, setAllCustomLabGroupSets] = useState([]);
    const [isEditingViaDivisionRow, setIsEditingViaDivisionRow] = useState(false);


    // Batch Management Modal State
    const [showBatchModal, setShowBatchModal] = useState(false);
    const [managingBatchesForDivision, setManagingBatchesForDivision] = useState(null);
    const [batchesForCurrentDivision, setBatchesForCurrentDivision] = useState([]);
    const [isLoadingBatchesInModal, setIsLoadingBatchesInModal] = useState(false);
    const [batchFormError, setBatchFormError] = useState('');
    const [newBatchName, setNewBatchName] = useState('');
    const [editingBatch, setEditingBatch] = useState(null);

    const [filters, setFilters] = useState({
        name: '', departmentId: '', year: '', semesterType: '', divisionType: '', courseCategory: '', linkedSubjectType: ''
    });

    const isAdmin = useMemo(() => userInfo?.role === 'Admin', [userInfo]);

    const calculatedSemesterForDivisionForm = useMemo(() => {
        return calculateSemester(divisionFormData.year, divisionFormData.semesterType);
    }, [divisionFormData.year, divisionFormData.semesterType]);

    const fetchDivisions = useCallback(async () => {
        setIsLoading(true); 
        setError(''); 
        const token = localStorage.getItem('authToken');
        if (!token) { setError('Authentication required.'); setIsLoading(false); return; }
        try {
            const queryParams = new URLSearchParams();
            if (filters.name) queryParams.append('name', filters.name);
            const deptIdToFilter = globalSelectedDepartment?.id || filters.departmentId;
            if (deptIdToFilter) queryParams.append('departmentId', deptIdToFilter);
            
            if (filters.year && filters.semesterType) {
                const sem = calculateSemester(filters.year, filters.semesterType);
                if (sem) {
                    queryParams.append('year', filters.year);
                    queryParams.append('semester', sem.toString()); 
                }
            } else if (filters.year) {
                queryParams.append('year', filters.year);
            }

            if (filters.divisionType) queryParams.append('divisionType', filters.divisionType);
            if (filters.courseCategory) queryParams.append('courseCategory', filters.courseCategory);
            if (filters.linkedSubjectType) queryParams.append('linkedSubjectType', filters.linkedSubjectType);
            
            const response = await axios.get(`${API_BASE_URL}/divisions?${queryParams.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setDivisions(response.data || []);
        } catch (err) {
            console.error("Fetch Divisions Error:", err);
            setError(err.response?.data?.message || 'Failed to fetch divisions.');
        } finally {
            setIsLoading(false); 
        }
    }, [filters, globalSelectedDepartment]);

    useEffect(() => {
        fetchDivisions();
        if (departments.length === 0 && !isLoadingDepartments) {
            fetchContextDepartments();
        }
    }, [fetchDivisions, departments.length, isLoadingDepartments, fetchContextDepartments]);

    const fetchPermanentBatchesForTheoryComposition = useCallback(async (deptId, yr, semType) => {
        const semesterNumber = calculateSemester(yr, semType); 
        if (!deptId || !yr || !semType || semesterNumber === null) {
            setAvailablePermanentBatchesForTheory([]);
            let errorMsg = "Department, Year, and Semester Type are required to fetch batches.";
            if(deptId && yr && semType && semesterNumber === null) { 
                errorMsg = "Invalid Year/Semester Type combination for batch composition.";
            }
            setDivisionFormError(errorMsg);
            return;
        }
        setIsLoadingPermanentBatchesForTheory(true);
        setDivisionFormError(''); 
        const token = localStorage.getItem('authToken');
        try {
            const response = await axios.get(`${API_BASE_URL}/divisions/permanent-batches-for-composition`, {
                params: { departmentId: deptId, year: yr, semester: semesterNumber },
                headers: { Authorization: `Bearer ${token}` }
            });
            setAvailablePermanentBatchesForTheory(response.data || []);
        } catch (err) {
            setAvailablePermanentBatchesForTheory([]);
            console.error("Error fetching permanent batches for theory comp:", err.response?.data || err.message);
            setDivisionFormError("Could not load batches for theory composition: " + (err.response?.data?.message || err.message));
        } finally {
            setIsLoadingPermanentBatchesForTheory(false);
        }
    }, []);


    useEffect(() => {
        const { divisionType, departmentId, year, semesterType } = divisionFormData;
        if (divisionType === 'Temporary' && departmentId && year && semesterType) {
            fetchPermanentBatchesForTheoryComposition(departmentId, year, semesterType);
        } else {
            setAvailablePermanentBatchesForTheory([]);
        }
    }, [divisionFormData.divisionType, divisionFormData.departmentId, divisionFormData.year, divisionFormData.semesterType, fetchPermanentBatchesForTheoryComposition]);

    const fetchAvailableBatchesForCustomLabGroupComposition = useCallback(async () => {
        const { departmentId, year, semesterType, linkedSubjectType, courseCategory } = customLabSetFilters;
        if (!departmentId || !year || !semesterType || !linkedSubjectType || !courseCategory) {
            setAvailableBatchesForCustomLabGroups([]); return;
        }
        setIsLoadingBatchesForCustomGroups(true);
        const token = localStorage.getItem('authToken');
        try {
            const response = await axios.get(`${API_BASE_URL}/divisions/custom-lab-group-sets/available-batches-for-set`, {
                params: { departmentId, year, semesterType, linkedSubjectType, courseCategory }, 
                headers: { Authorization: `Bearer ${token}` }
            });
            setAvailableBatchesForCustomLabGroups(response.data || []);
        } catch (err) {
            setAvailableBatchesForCustomLabGroups([]);
            setCustomLabSetFormError("Could not load batches for custom lab group: " + (err.response?.data?.message || err.message));
        } finally {
            setIsLoadingBatchesForCustomGroups(false);
        }
    }, [customLabSetFilters]);

    useEffect(() => {
        if (showCustomLabGroupModal && customLabSetFilters.departmentId && customLabSetFilters.year && customLabSetFilters.semesterType && customLabSetFilters.linkedSubjectType && customLabSetFilters.courseCategory) {
            fetchAvailableBatchesForCustomLabGroupComposition();
        } else {
            setAvailableBatchesForCustomLabGroups([]);
        }
    }, [showCustomLabGroupModal, customLabSetFilters, fetchAvailableBatchesForCustomLabGroupComposition]);


    const handleDivisionInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setDivisionFormData(prev => {
            const newState = { ...prev, [name]: type === 'checkbox' ? checked : value };
            if (name === 'divisionType') {
                if (value === 'Temporary') {
                    newState.defaultBatchCount = 0; 
                    newState.linkedSubjectType = prev.linkedSubjectType === 'Common' ? '' : prev.linkedSubjectType;
                } else if (value === 'Permanent') {
                    newState.permanentBatchIds = []; 
                    newState.defaultBatchCount = 3;
                }
            }
            if (name === 'linkedSubjectType' && value === 'Common' && newState.divisionType === 'Temporary') {
                newState.linkedSubjectType = ''; 
            }
            if (name === 'year' || name === 'semesterType' || name === 'departmentId') { 
                newState.permanentBatchIds = []; 
                setAvailablePermanentBatchesForTheory([]);
            }
            return newState;
        });
    };

    const handlePermanentBatchSelectionForTheory = (batchId) => {
        const numBatchId = Number(batchId);
        setDivisionFormData(prev => ({
            ...prev,
            permanentBatchIds: prev.permanentBatchIds.includes(numBatchId)
                ? prev.permanentBatchIds.filter(id => id !== numBatchId)
                : [...prev.permanentBatchIds, numBatchId]
        }));
    };

    const resetDivisionForm = () => {
        setDivisionFormData({
            name: '', departmentId: globalSelectedDepartment?.id.toString() || '', year: '', semesterType: '',
            divisionType: DIVISION_TYPES[0].value, defaultBatchCount: 3, courseCategory: '',
            linkedSubjectType: '', permanentBatchIds: [],
        });
        setCurrentDivisionId(null); setIsEditModeDivision(false); setShowDivisionForm(false); setDivisionFormError('');
        setAvailablePermanentBatchesForTheory([]);
    };

    const handleAddDivisionFormShow = () => {
        resetDivisionForm();
        setIsEditModeDivision(false);
        setShowDivisionForm(true);
    };

    const handleEditDivisionFormShow = (division) => {
        resetDivisionForm();
        setIsEditModeDivision(true);
        setDivisionFormData({
            name: division.name,
            departmentId: division.departmentId?.toString() || '',
            year: division.year?.toString() || '',
            semesterType: division.semester % 2 === 0 ? 'even' : 'odd',
            divisionType: division.divisionType,
            defaultBatchCount: division.divisionType === 'Permanent' ? (division.batches?.length || 0) : 0,
            courseCategory: division.courseCategory || '',
            linkedSubjectType: division.linkedSubjectType || '',
            permanentBatchIds: division.divisionType === 'Temporary' ? (division.composedOfPermanentBatches?.map(b => b.id) || []) : [],
        });
        setCurrentDivisionId(division.id);
        setShowDivisionForm(true);
    };

    const handleSubmitDivisionForm = async (e) => {
        e.preventDefault();
        setDivisionFormError(''); setSuccessMessage(''); setError('');
        const token = localStorage.getItem('authToken');
        if (!token || !isAdmin) { setDivisionFormError('Unauthorized action.'); return; }

        if (!divisionFormData.departmentId) { setDivisionFormError('Department is required.'); return; }
        if (divisionFormData.divisionType === 'Permanent' && (!isEditModeDivision && (divisionFormData.defaultBatchCount === undefined || parseInt(divisionFormData.defaultBatchCount) < 0))) {
            setDivisionFormError('Default Batch Count must be a non-negative number for new Permanent divisions.'); return;
        }
        if (divisionFormData.divisionType === 'Temporary' && divisionFormData.linkedSubjectType === 'Common') {
            setDivisionFormError('Temporary divisions cannot be linked to "Common" subject type.'); return;
        }
        if (divisionFormData.divisionType === 'Temporary' && divisionFormData.linkedSubjectType && divisionFormData.linkedSubjectType !== 'Common' && !divisionFormData.courseCategory.trim()) {
            setDivisionFormError(`Course Category is required for Temporary ${divisionFormData.linkedSubjectType} divisions.`); return;
        }
        if (divisionFormData.divisionType === 'Temporary' && (!divisionFormData.permanentBatchIds || divisionFormData.permanentBatchIds.length === 0)) {
            setDivisionFormError(`Temporary divisions must be composed of at least one permanent batch for theory lectures.`); return;
        }

        const payload = { ...divisionFormData };
        payload.departmentId = parseInt(payload.departmentId);
        payload.year = parseInt(payload.year);

        if (payload.divisionType === 'Permanent') {
            payload.defaultBatchCount = parseInt(payload.defaultBatchCount);
            delete payload.permanentBatchIds; 
        } else { 
            delete payload.defaultBatchCount;
            payload.permanentBatchIds = payload.permanentBatchIds.map(id => parseInt(id));
        }
        if (!payload.linkedSubjectType) payload.linkedSubjectType = null;
        if (!payload.courseCategory || payload.courseCategory.trim() === '') payload.courseCategory = null;

        setIsLoading(true);
        try {
            if (isEditModeDivision) {
                await axios.put(`${API_BASE_URL}/divisions/${currentDivisionId}`, payload, { headers: { Authorization: `Bearer ${token}` } });
                setSuccessMessage('Division updated successfully!');
            } else {
                await axios.post(`${API_BASE_URL}/divisions`, payload, { headers: { Authorization: `Bearer ${token}` } });
                setSuccessMessage('Division created successfully!');
            }
            resetDivisionForm(); 
            fetchDivisions(); 
        } catch (err) {
            console.error("Submit Division Error:", err);
            setDivisionFormError(err.response?.data?.message || 'Failed to save division.');
            setIsLoading(false); 
        } 
    };
    
    const handleDeleteDivision = async (divisionId, divisionName) => {
        if (!window.confirm(`Are you sure you want to delete division "${divisionName}" (ID: ${divisionId})? This action cannot be undone.`)) return;
        setError(''); setSuccessMessage('');
        const token = localStorage.getItem('authToken');
        if (!token || !isAdmin) { setError('Unauthorized action.'); return; }
        setIsLoading(true);
        try {
            await axios.delete(`${API_BASE_URL}/divisions/${divisionId}`, { headers: { Authorization: `Bearer ${token}` } });
            setSuccessMessage(`Division "${divisionName}" deleted successfully!`);
            fetchDivisions();
        } catch (err) {
            console.error("Delete Division Error:", err);
            setError(err.response?.data?.message || 'Failed to delete division.');
        } finally {
            setIsLoading(false);
        }
    };

    const openCustomLabGroupModal = () => { 
        setIsEditingViaDivisionRow(false);
        setCustomLabSetFilters({
            departmentId: globalSelectedDepartment?.id.toString() || '',
            year: '', semesterType: '', linkedSubjectType: '', courseCategory: ''
        });
        setEditingCustomLabSet(null);
        setCustomLabBatchDefinitions([{ name: 'Lab Group 1', permanentBatchIds: [] }]);
        setAvailableBatchesForCustomLabGroups([]);
        setCustomLabSetFormError('');
        setShowCustomLabGroupModal(true);
        fetchAllCustomLabGroupSets(); 
    };

    const openCustomLabGroupModalForEdit = (division) => {
        if (!division || !division.applicableCustomLabGroupSet) {
            console.warn("Attempted to edit custom labs for a division without an applicable set.", division);
            setCustomLabSetFormError("No custom lab group set found for this division's context to edit. You can create one via 'Manage Custom Lab Groups'.");
            return;
        }
        setIsEditingViaDivisionRow(true);
        const set = division.applicableCustomLabGroupSet;
        setCustomLabSetFilters({
            departmentId: division.departmentId.toString(),
            year: division.year.toString(),
            semesterType: division.semester % 2 === 0 ? 'even' : 'odd',
            linkedSubjectType: division.linkedSubjectType,
            courseCategory: division.courseCategory,
        });
        setEditingCustomLabSet(set);
        setCustomLabBatchDefinitions(set.customLabBatches.map(cb => ({
            id: cb.id,
            name: cb.name,
            permanentBatchIds: cb.composedOfPermanentBatches.map(pb => pb.id)
        })));
        setCustomLabSetFormError('');
        setShowCustomLabGroupModal(true);
    };


    const closeCustomLabGroupModal = () => {
        setShowCustomLabGroupModal(false);
        setEditingCustomLabSet(null);
        setCustomLabBatchDefinitions([]);
        setIsEditingViaDivisionRow(false);
    };

    const handleCustomLabSetFilterChange = (e) => {
        const { name, value } = e.target;
        setCustomLabSetFilters(prev => ({ ...prev, [name]: value }));
        if (!isEditingViaDivisionRow) {
            setEditingCustomLabSet(null); 
            setCustomLabBatchDefinitions([]); 
        }
    };

    const handleLoadExistingCustomLabSet = async () => {
        const { departmentId, year, semesterType, linkedSubjectType, courseCategory } = customLabSetFilters;
        if (!departmentId || !year || !semesterType || !linkedSubjectType || !courseCategory) {
            setCustomLabSetFormError("All context fields (Department, Year, etc.) are required to load or define a custom lab group set.");
            setEditingCustomLabSet(null); setCustomLabBatchDefinitions([]);
            return;
        }
        setCustomLabSetFormError('');
        setIsLoadingBatchesForCustomGroups(true); 
        
        try {
            const calculatedSemForFilter = calculateSemester(year, semesterType);
            if (!calculatedSemForFilter) { 
                setCustomLabSetFormError("Invalid Year/Semester Type for context.");
                setIsLoadingBatchesForCustomGroups(false);
                return;
            }
            await fetchAllCustomLabGroupSets(); 
            const existingSet = allCustomLabGroupSets.find(s =>
                s.departmentId === parseInt(departmentId) &&
                s.year === parseInt(year) &&
                s.semester === calculatedSemForFilter &&
                s.linkedSubjectType === linkedSubjectType &&
                s.courseCategory === courseCategory.trim()
            );

            if (existingSet) {
                setEditingCustomLabSet(existingSet);
                setCustomLabBatchDefinitions(existingSet.customLabBatches.map(cb => ({
                    id: cb.id, 
                    name: cb.name,
                    permanentBatchIds: cb.composedOfPermanentBatches.map(pb => pb.id)
                })));
            } else {
                setEditingCustomLabSet(null); 
                setCustomLabBatchDefinitions([{ name: 'Lab Group 1', permanentBatchIds: [] }]); 
            }
            fetchAvailableBatchesForCustomLabGroupComposition();

        } catch (err) {
            console.error("Error loading existing custom lab set:", err);
            setCustomLabSetFormError(err.response?.data?.message || "Failed to load custom lab group set data.");
            setEditingCustomLabSet(null); setCustomLabBatchDefinitions([]);
        } finally {
            setIsLoadingBatchesForCustomGroups(false);
        }
    };
    
    const fetchAllCustomLabGroupSets = useCallback(async () => {
        const token = localStorage.getItem('authToken');
        if (!token || !isAdmin) {
            setAllCustomLabGroupSets([]); 
            return;
        }
        try {
            const response = await axios.get(`${API_BASE_URL}/divisions/custom-lab-group-sets`, {
                 headers: { Authorization: `Bearer ${token}` }
            });
            setAllCustomLabGroupSets(response.data || []);
        } catch (error) {
            console.error("Error fetching all custom lab group sets:", error);
            setAllCustomLabGroupSets([]);
        }
    }, [isAdmin]);

    useEffect(() => {
        if(isAdmin) fetchAllCustomLabGroupSets();
    }, [isAdmin, fetchAllCustomLabGroupSets]);


    const handleCustomLabGroupDefCountChange = (e) => {
        let count = parseInt(e.target.value);
        if (isNaN(count) || count < 0) count = 0;
        if (count > 10) count = 10;

        setCustomLabBatchDefinitions(prevDefs => {
            const newDefs = [];
            for (let i = 0; i < count; i++) {
                if (prevDefs[i]) {
                    newDefs.push(prevDefs[i]);
                } else {
                    newDefs.push({ name: `Lab Group ${i + 1}`, permanentBatchIds: [] });
                }
            }
            return newDefs;
        });
    };

    const handleCustomLabGroupDefNameChange = (index, name) => {
        setCustomLabBatchDefinitions(prevDefs =>
            prevDefs.map((def, i) => (i === index ? { ...def, name } : def))
        );
    };

    const handleCustomLabGroupDefBatchSelection = (groupIndex, batchId) => {
        const numBatchId = Number(batchId);
        setCustomLabBatchDefinitions(prevDefs =>
            prevDefs.map((def, i) => {
                if (i === groupIndex) {
                    const currentIds = def.permanentBatchIds || [];
                    const newPermanentBatchIds = currentIds.includes(numBatchId)
                        ? currentIds.filter(id => id !== numBatchId)
                        : [...currentIds, numBatchId];
                    return { ...def, permanentBatchIds: newPermanentBatchIds };
                }
                return def;
            })
        );
    };

    const handleSaveCustomLabGroupSet = async () => {
        const { departmentId, year, semesterType, linkedSubjectType, courseCategory } = customLabSetFilters;
        if (!departmentId || !year || !semesterType || !linkedSubjectType || !courseCategory) {
            setCustomLabSetFormError("All context fields (Department, Year, etc.) are required."); return;
        }
        if (customLabBatchDefinitions.length === 0) {
            setCustomLabSetFormError("At least one custom lab batch must be defined."); return;
        }
        for (const def of customLabBatchDefinitions) {
            if (!def.name.trim() || def.permanentBatchIds.length === 0) {
                setCustomLabSetFormError("Each custom lab batch must have a name and at least one selected permanent batch."); return;
            }
        }

        setIsSavingCustomLabSet(true); setCustomLabSetFormError('');
        const token = localStorage.getItem('authToken');
        const payload = {
            ...customLabSetFilters, 
            customLabBatches: customLabBatchDefinitions.map(def => ({ name: def.name, permanentBatchIds: def.permanentBatchIds }))
        };

        try {
            if (editingCustomLabSet && editingCustomLabSet.id) { 
                await axios.put(`${API_BASE_URL}/divisions/custom-lab-group-sets/${editingCustomLabSet.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
                setSuccessMessage("Custom Lab Group Set updated successfully!");
            } else { 
                await axios.post(`${API_BASE_URL}/divisions/custom-lab-group-sets`, payload, { headers: { Authorization: `Bearer ${token}` } });
                setSuccessMessage("Custom Lab Group Set created successfully!");
            }
            closeCustomLabGroupModal();
            fetchDivisions(); 
            fetchAllCustomLabGroupSets(); 
        } catch (err) {
            console.error("Save Custom Lab Group Set Error:", err);
            setCustomLabSetFormError(err.response?.data?.message || "Failed to save custom lab group set.");
        } finally {
            setIsSavingCustomLabSet(false);
        }
    };
    
    const handleDeleteCustomLabGroupSet = async (setId) => {
        if (!window.confirm("Are you sure you want to delete this entire Custom Lab Group Set? This will affect lab allocations.")) return;
        const token = localStorage.getItem('authToken');
        setIsSavingCustomLabSet(true); 
        try {
            await axios.delete(`${API_BASE_URL}/divisions/custom-lab-group-sets/${setId}`, { headers: { Authorization: `Bearer ${token}` } });
            setSuccessMessage("Custom Lab Group Set deleted successfully.");
            setEditingCustomLabSet(null); 
            setCustomLabBatchDefinitions([]); 
            fetchDivisions(); 
            fetchAllCustomLabGroupSets(); 
            if(isEditingViaDivisionRow){
                closeCustomLabGroupModal();
            } else {
                const deletedSetContext = allCustomLabGroupSets.find(s => s.id === setId);
                if(deletedSetContext &&
                    deletedSetContext.departmentId === parseInt(customLabSetFilters.departmentId) &&
                    deletedSetContext.year === parseInt(customLabSetFilters.year) &&
                    deletedSetContext.semester === calculateSemester(customLabSetFilters.year, customLabSetFilters.semesterType) &&
                    deletedSetContext.linkedSubjectType === customLabSetFilters.linkedSubjectType &&
                    deletedSetContext.courseCategory === customLabSetFilters.courseCategory
                ) {
                   setCustomLabSetFilters({ departmentId: globalSelectedDepartment?.id.toString() || '', year: '', semesterType: '', linkedSubjectType: '', courseCategory: '' });
                }
            }
        } catch (err) {
            setCustomLabSetFormError(err.response?.data?.message || "Failed to delete set.");
        } finally {
            setIsSavingCustomLabSet(false);
        }
    };

    // MODIFIED openBatchModal to improve error message and logging
    const openBatchModal = async (division) => {
        if (!division) {
            console.error("openBatchModal called with undefined division object");
            setBatchFormError("Cannot manage batches: Division data is missing.");
            return;
        }
        
        // console.log("Opening batch modal for division (raw object):", JSON.stringify(division));
        // console.log("Division ID type:", typeof division.id, "Division ID value:", division.id);

        if (division.divisionType !== 'Permanent') {
            alert("Batches can only be directly managed for 'Permanent' type divisions.");
            return;
        }

        if (division.id === undefined || division.id === null || String(division.id).trim() === "") {
            console.error("Division ID is missing or empty for batch management. Division object:", JSON.stringify(division));
            setBatchFormError(`Cannot manage batches for division "${division.name || 'Unknown'}": Division ID is missing or invalid.`);
            return;
        }
        
        setManagingBatchesForDivision(division); 
        setShowBatchModal(true);
        setBatchFormError('');
        setNewBatchName('');
        setEditingBatch(null);
        setIsLoadingBatchesInModal(true);
        const token = localStorage.getItem('authToken');
        try {
            const url = `${API_BASE_URL}/divisions/${division.id}/batches`;
            // console.log("Requesting batches from URL:", url); 

            const response = await axios.get(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setBatchesForCurrentDivision(response.data || []);
        } catch (err) {
            console.error("Failed to load batches. Full error object:", err);
            let errorMsg = 'Failed to load batches.';
            if (err.response) {
                console.error("Error response data:", err.response.data);
                console.error("Error response status:", err.response.status);
                const backendMessage = err.response.data?.message;
                errorMsg += ` Status: ${err.response.status}. ${backendMessage ? `Server: "${backendMessage}"` : `Client: "${err.message}"`}`;
            } else if (err.request) {
                errorMsg += ' No response from server. Check network connection.';
            } else {
                errorMsg += ` Error setting up request - ${err.message}`;
            }
            setBatchFormError(errorMsg);
            setBatchesForCurrentDivision([]);
        } finally {
            setIsLoadingBatchesInModal(false);
        }
    };

    const closeBatchModal = () => {
        setShowBatchModal(false);
        setManagingBatchesForDivision(null);
        setBatchesForCurrentDivision([]);
        setNewBatchName('');
        setEditingBatch(null);
        fetchDivisions(); 
    };

    const handleAddOrUpdateBatch = async (e) => {
        e.preventDefault();
        if (!newBatchName.trim()) {
            setBatchFormError("Batch name cannot be empty.");
            return;
        }
        setIsLoadingBatchesInModal(true);
        setBatchFormError('');
        const token = localStorage.getItem('authToken');
        if (!managingBatchesForDivision || managingBatchesForDivision.id === undefined || managingBatchesForDivision.id === null) {
            setBatchFormError("Cannot save batch: Managing division data is invalid.");
            setIsLoadingBatchesInModal(false);
            return;
        }
        const divisionId = managingBatchesForDivision.id;

        try {
            if (editingBatch) {
                await axios.put(`${API_BASE_URL}/divisions/batches/${editingBatch.id}`, { name: newBatchName.trim() }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else {
                await axios.post(`${API_BASE_URL}/divisions/${divisionId}/batches`, { name: newBatchName.trim() }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
            setNewBatchName('');
            setEditingBatch(null);
            const response = await axios.get(`${API_BASE_URL}/divisions/${divisionId}/batches`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setBatchesForCurrentDivision(response.data || []);
        } catch (err) {
            setBatchFormError(err.response?.data?.message || "Failed to save batch.");
        } finally {
            setIsLoadingBatchesInModal(false);
        }
    };

    const handleEditBatch = (batch) => {
        setEditingBatch(batch);
        setNewBatchName(batch.name);
        setBatchFormError('');
    };

    const handleDeleteBatch = async (batchId, batchName) => {
        if (!window.confirm(`Are you sure you want to delete batch '${batchName}'?`)) return;
        setIsLoadingBatchesInModal(true);
        setBatchFormError('');
        const token = localStorage.getItem('authToken');
        if (!managingBatchesForDivision || managingBatchesForDivision.id === undefined || managingBatchesForDivision.id === null) {
            setBatchFormError("Cannot delete batch: Managing division data is invalid.");
            setIsLoadingBatchesInModal(false);
            return;
        }
        const divisionId = managingBatchesForDivision.id;

        try {
            await axios.delete(`${API_BASE_URL}/divisions/batches/${batchId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const response = await axios.get(`${API_BASE_URL}/divisions/${divisionId}/batches`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setBatchesForCurrentDivision(response.data || []);
        } catch (err) {
            setBatchFormError(err.response?.data?.message || "Failed to delete batch.");
        } finally {
            setIsLoadingBatchesInModal(false);
        }
    };
    
    const handleMainFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };
    const resetMainFilters = () => {
        setFilters({ name: '', departmentId: globalSelectedDepartment?.id.toString() || '', year: '', semesterType: '', divisionType: '', courseCategory: '', linkedSubjectType: '' });
    };
    
    const handleDownloadExcel = () => {
        if (divisions.length === 0) {
            alert("No data to export.");
            return;
        }
        const dataToExport = divisions.map(div => {
            const department = departments.find(d => d.id === div.departmentId);
            let theoryBatchesInfo = '';
            let labBatchesInfo = 'N/A';

            if (div.divisionType === 'Permanent') {
                theoryBatchesInfo = div.batches?.map(b => b.name).join(', ') || 'N/A (Manage Batches)';
                labBatchesInfo = theoryBatchesInfo; 
            } else if (div.divisionType === 'Temporary') {
                theoryBatchesInfo = div.composedOfPermanentBatches?.map(b => `${b.name}(${b.permanentDivision?.name || '?'})`).join('; ') || 'Not Composed';
                if (div.applicableCustomLabGroupSet && div.applicableCustomLabGroupSet.customLabBatches?.length > 0) {
                    labBatchesInfo = div.applicableCustomLabGroupSet.customLabBatches.map(clg => 
                        `${clg.name}(${(clg.composedOfPermanentBatches || []).map(b => b.name).join('+') || 'No batches'})`
                    ).join('; ');
                } else if (div.composedOfPermanentBatches?.length > 0) {
                    labBatchesInfo = "Follows theory composition batches";
                }
            }

            return {
                "Division ID": div.id,
                "Division Name": div.name,
                "Department": department?.name || 'N/A',
                "Year": div.year,
                "Semester": div.semester,
                "Division Type": div.divisionType,
                "Linked Subject Type": div.linkedSubjectType ? formatSubjectType(div.linkedSubjectType) : '-',
                "Course Category": div.courseCategory || '-',
                "Batches (Theory/Default Composition)": theoryBatchesInfo,
                "Batches for Lab (or Custom Groups)": labBatchesInfo,
                "Created At": new Date(div.createdAt).toLocaleString(),
                "Updated At": new Date(div.updatedAt).toLocaleString(),
            };
        });
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "DivisionsAndLabGroups");
        XLSX.writeFile(workbook, `Divisions_And_LabGroups_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
        setSuccessMessage("Data exported to Excel successfully.");
    };


    const inputStyle = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 disabled:opacity-70 disabled:bg-gray-100 dark:disabled:bg-gray-600";
    const labelStyle = "block text-sm font-medium text-gray-700 dark:text-gray-300";
    const buttonPrimaryStyle = "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-50";
    const buttonSecondaryStyle = "px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100 rounded-md text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400 disabled:opacity-50";
    const tableHeaderStyle = "px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider";
    const tableCellStyle = "px-3 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300";

    return (
        <div className="container mx-auto p-4 md:p-6">
            {/* Header and Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-3 md:gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">
                    Division & Batch Management {globalSelectedDepartment ? `(${globalSelectedDepartment.name})` : ''}
                </h1>
                {isAdmin && !showDivisionForm && !showCustomLabGroupModal && (
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                         <button onClick={handleDownloadExcel} disabled={isLoading || divisions.length === 0} className={`${buttonSecondaryStyle} bg-teal-600 hover:bg-teal-700 text-white disabled:bg-teal-400 text-xs sm:text-sm`}>Export Excel</button>
                         <button onClick={openCustomLabGroupModal} className={`${buttonPrimaryStyle} bg-purple-600 hover:bg-purple-700 text-xs sm:text-sm`}>Manage Custom Lab Groups</button>
                         <button onClick={handleAddDivisionFormShow} className={`${buttonPrimaryStyle} bg-green-600 hover:bg-green-700 text-xs sm:text-sm`}>Add New Division</button>
                    </div>
                )}
            </div>
            {/* Error and Success Messages */}
            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-300 p-4 mb-4 rounded-md" role="alert"><button onClick={() => setError('')} className="float-right font-bold text-lg">&times;</button>{error}</div>}
            {successMessage && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-300 p-4 mb-4 rounded-md" role="alert"><button onClick={() => setSuccessMessage('')} className="float-right font-bold text-lg">&times;</button>{successMessage}</div>}

            {/* Division Add/Edit Form */}
            {isAdmin && showDivisionForm && (
                 <form onSubmit={handleSubmitDivisionForm} className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">{isEditModeDivision ? 'Edit Division' : 'Add New Division'}</h2>
                        <button type="button" onClick={resetDivisionForm} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 mb-3 text-2xl leading-none">&times;</button>
                    </div>
                    {divisionFormError && <div className="bg-red-100 text-red-700 p-3 mb-3 rounded-md text-sm" role="alert">{divisionFormError}</div>}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Form fields */}
                        <div><label htmlFor="name" className={labelStyle}>Division Name*</label><input type="text" name="name" value={divisionFormData.name} onChange={handleDivisionInputChange} required className={inputStyle}/></div>
                        <div><label htmlFor="formDepartmentId" className={labelStyle}>Department*</label><select name="departmentId" id="formDepartmentId" value={divisionFormData.departmentId} onChange={handleDivisionInputChange} required className={inputStyle} disabled={isLoadingDepartments || !!globalSelectedDepartment || isEditModeDivision}><option value="">-- Select --</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>{!!globalSelectedDepartment && <p className="text-xs text-gray-500 mt-1">Using global: {globalSelectedDepartment.name}</p>}</div>
                        <div><label htmlFor="formYear" className={labelStyle}>Year*</label><select name="year" id="formYear" value={divisionFormData.year} onChange={handleDivisionInputChange} required className={inputStyle} disabled={isEditModeDivision}><option value="">-- Select --</option>{YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}</select></div>
                        <div><label htmlFor="formSemesterType" className={labelStyle}>Semester Type*</label><select name="semesterType" id="formSemesterType" value={divisionFormData.semesterType} onChange={handleDivisionInputChange} required className={inputStyle} disabled={isEditModeDivision}><option value="">-- Select --</option>{SEMESTER_TYPES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}</select></div>
                        <div><label className={labelStyle}>Calculated Semester</label><input type="text" value={calculatedSemesterForDivisionForm || 'N/A'} readOnly className={`${inputStyle} bg-gray-100 dark:bg-gray-700/50`} /></div>
                        <div><label htmlFor="divisionType" className={labelStyle}>Division Type*</label><select name="divisionType" value={divisionFormData.divisionType} onChange={handleDivisionInputChange} required className={inputStyle} disabled={isEditModeDivision}><option value="">-- Select --</option>{DIVISION_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}</select>{isEditModeDivision && <p className="text-xs text-gray-500 mt-1">Type cannot be changed after creation.</p>}</div>
                        <div><label htmlFor="linkedSubjectType" className={labelStyle}>Link to Subject Type</label><select name="linkedSubjectType" value={divisionFormData.linkedSubjectType} onChange={handleDivisionInputChange} className={inputStyle}><option value="">-- None --</option>{SUBJECT_TYPES_ENUM.map(st => (<option key={st} value={st} disabled={divisionFormData.divisionType === 'Temporary' && st === 'Common'}>{formatSubjectType(st)}</option>))}</select>{divisionFormData.divisionType === 'Temporary' && divisionFormData.linkedSubjectType === 'Common' && <p className="text-xs text-red-500 mt-1">"Common" not for Temp divs.</p>}</div>
                        <div><label htmlFor="courseCategory" className={labelStyle}>Link to Course Category</label><input type="text" name="courseCategory" value={divisionFormData.courseCategory} onChange={handleDivisionInputChange} className={inputStyle} placeholder="e.g., PCC, DLO6-AI" /><p className="text-xs text-gray-500 dark:text-gray-400 mt-1">E.g., PCC for Common. Required for DLO/ILOT/MajorMinor types if linked.</p></div>
                        {divisionFormData.divisionType === 'Permanent' && (<div><label htmlFor="defaultBatchCount" className={labelStyle}>Batches to Create (New Permanent Div)*</label><input type="number" name="defaultBatchCount" value={divisionFormData.defaultBatchCount} onChange={handleDivisionInputChange} required={!isEditModeDivision && divisionFormData.divisionType === 'Permanent'} min="0" className={inputStyle} disabled={isEditModeDivision}/>{isEditModeDivision && <p className="text-xs text-gray-500 mt-1">Manage existing batches separately.</p>}</div>)}
                    </div>

                    {divisionFormData.divisionType === 'Temporary' && (
                        <div className="mt-4 pt-4 border-t dark:border-gray-700">
                            <label className={`${labelStyle} mb-2`}>Compose with Permanent Batches (for Theory Lectures)</label>
                            {isLoadingPermanentBatchesForTheory && <p>Loading batches...</p>}
                            {!isLoadingPermanentBatchesForTheory && availablePermanentBatchesForTheory.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No 'Permanent' type batches found for selected Dept/Year/Sem. These are needed to compose Temporary divisions.</p>}
                            {!isLoadingPermanentBatchesForTheory && availablePermanentBatchesForTheory.length > 0 && (
                                <div className="max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 p-2 border dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/30">
                                    {availablePermanentBatchesForTheory.map(batch => (
                                        <label key={`theory-comp-${batch.id}`} className="flex items-center space-x-2 p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                                            <input type="checkbox" checked={divisionFormData.permanentBatchIds.includes(batch.id)} onChange={() => handlePermanentBatchSelectionForTheory(batch.id)} className="form-checkbox h-4 w-4"/>
                                            <span className="text-sm">{batch.name} ({batch.divisionName})</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    <div className="mt-6 flex justify-end space-x-3">
                        <button type="button" onClick={resetDivisionForm} className={buttonSecondaryStyle} disabled={isLoading}>Cancel</button>
                        <button type="submit" className={buttonPrimaryStyle} disabled={isLoading}>{isLoading ? (isEditModeDivision ? 'Updating...' : 'Creating...') : (isEditModeDivision ? 'Update Division' : 'Create Division')}</button>
                    </div>
                </form>
            )}

            {/* Custom Lab Group Set Management Modal Trigger and Table */}
            {isAdmin && showCustomLabGroupModal && (
                 <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                        {/* Modal Content for Custom Lab Groups */}
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Manage Custom Lab Group Sets for Electives</h2>
                            <button onClick={closeCustomLabGroupModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none">&times;</button>
                        </div>
                        {customLabSetFormError && <div className="bg-red-100 text-red-700 p-3 mb-3 rounded text-sm">{customLabSetFormError}</div>}
                        
                        <div className="mb-4 p-3 border dark:border-gray-600 rounded-md">
                            <h3 className="text-md font-semibold mb-2 text-gray-700 dark:text-gray-200">Define Context for Lab Group Set</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div><label className={labelStyle}>Department*</label><select name="departmentId" value={customLabSetFilters.departmentId} onChange={handleCustomLabSetFilterChange} className={inputStyle} disabled={isLoadingDepartments || !!globalSelectedDepartment || isEditingViaDivisionRow}><option value="">--Select--</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>{!!globalSelectedDepartment && <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">Global: {globalSelectedDepartment.name}</p>}</div>
                                <div><label className={labelStyle}>Year*</label><select name="year" value={customLabSetFilters.year} onChange={handleCustomLabSetFilterChange} className={inputStyle} disabled={isEditingViaDivisionRow}><option value="">--Select--</option>{YEARS.map(y=><option key={y.value} value={y.value}>{y.label}</option>)}</select></div>
                                <div><label className={labelStyle}>Semester Type*</label><select name="semesterType" value={customLabSetFilters.semesterType} onChange={handleCustomLabSetFilterChange} className={inputStyle} disabled={isEditingViaDivisionRow}><option value="">--Select--</option>{SEMESTER_TYPES.map(st=><option key={st.value} value={st.value}>{st.label}</option>)}</select></div>
                                <div><label className={labelStyle}>Linked Subject Type*</label><select name="linkedSubjectType" value={customLabSetFilters.linkedSubjectType} onChange={handleCustomLabSetFilterChange} className={inputStyle} disabled={isEditingViaDivisionRow}><option value="">--Select--</option>{ELECTIVE_SUBJECT_TYPES_FOR_CUSTOM_LABS.map(st=><option key={st} value={st}>{formatSubjectType(st)}</option>)}</select></div>
                                <div className="md:col-span-2"><label className={labelStyle}>Course Category (for this elective offering)*</label><input type="text" name="courseCategory" value={customLabSetFilters.courseCategory} onChange={handleCustomLabSetFilterChange} placeholder="e.g., DLO2-AI, MM-DS-SEM6" className={inputStyle} disabled={isEditingViaDivisionRow}/></div>
                            </div>
                            {!isEditingViaDivisionRow && (
                                <button onClick={handleLoadExistingCustomLabSet} className={`${buttonSecondaryStyle} mt-3 text-xs`} disabled={!customLabSetFilters.departmentId || !customLabSetFilters.year || !customLabSetFilters.semesterType || !customLabSetFilters.linkedSubjectType || !customLabSetFilters.courseCategory || isLoadingBatchesForCustomGroups}>
                                    {isLoadingBatchesForCustomGroups ? "Loading..." : (editingCustomLabSet ? "Reload/Edit Existing Set" : "Load/Define New Set")}
                                </button>
                            )}
                        </div>

                        {(editingCustomLabSet || (customLabSetFilters.departmentId && customLabSetFilters.year && customLabSetFilters.semesterType && customLabSetFilters.linkedSubjectType && customLabSetFilters.courseCategory)) && (
                            <div className="mt-4 space-y-4">
                                <div>
                                    <label htmlFor="numCustomLabBatchDefs" className={labelStyle}>Number of Custom Lab Batches for this Set</label>
                                    <input type="number" id="numCustomLabBatchDefs" value={customLabBatchDefinitions.length} onChange={handleCustomLabGroupDefCountChange} min="0" max="10" className={`${inputStyle} w-24`} />
                                </div>
                                {customLabBatchDefinitions.map((groupDef, groupIndex) => (
                                    <div key={`custom-lab-def-${groupIndex}`} className="p-3 border dark:border-gray-500 rounded-md bg-gray-50 dark:bg-gray-700/50">
                                        <label className={`${labelStyle} mb-1`}>Custom Lab Batch {groupIndex + 1} Name*</label>
                                        <input type="text" value={groupDef.name} onChange={(e) => handleCustomLabGroupDefNameChange(groupIndex, e.target.value)} required placeholder={`e.g., Lab Batch A`} className={`${inputStyle} mb-2`} />
                                        
                                        <label className={`${labelStyle} mb-1`}>Compose with Batches (from relevant Temporary Divisions)*</label>
                                        {isLoadingBatchesForCustomGroups && <p className="text-xs text-gray-500 dark:text-gray-400">Loading available batches...</p>}
                                        {!isLoadingBatchesForCustomGroups && availableBatchesForCustomLabGroups.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">No permanent batches found within Temporary Divisions matching the selected context. Ensure Temporary Divisions (linked to this Subject Type & Course Category) are created and composed with permanent batches first.</p>}
                                        {!isLoadingBatchesForCustomGroups && availableBatchesForCustomLabGroups.length > 0 && (
                                            <div className="max-h-32 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1 p-1 border dark:border-gray-500 rounded-md bg-white dark:bg-gray-700">
                                                {availableBatchesForCustomLabGroups.map(batch => (
                                                    <label key={`custom-lab-def-${groupIndex}-batch-${batch.id}`} className="flex items-center space-x-1.5 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer text-xs">
                                                        <input type="checkbox" checked={(groupDef.permanentBatchIds || []).includes(batch.id)} onChange={() => handleCustomLabGroupDefBatchSelection(groupIndex, batch.id)} className="form-checkbox h-3.5 w-3.5"/>
                                                        <span>{batch.name} ({batch.permanentDivisionName})</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <div className="mt-6 flex justify-between items-center">
                                    <button type="button" onClick={handleSaveCustomLabGroupSet} className={buttonPrimaryStyle} disabled={isSavingCustomLabSet || customLabBatchDefinitions.length === 0}>
                                        {isSavingCustomLabSet ? 'Saving...' : (editingCustomLabSet ? 'Update Set' : 'Create Set')}
                                    </button>
                                    {editingCustomLabSet && (
                                        <button type="button" onClick={() => handleDeleteCustomLabGroupSet(editingCustomLabSet.id)} className={`${buttonPrimaryStyle} bg-red-600 hover:bg-red-700`} disabled={isSavingCustomLabSet}>Delete This Set</button>
                                    )}
                                </div>
                            </div>
                        )}
                         <button onClick={closeCustomLabGroupModal} className={`${buttonSecondaryStyle} mt-6 w-full`}>Close Manager</button>
                    </div>
                </div>
            )}

            {/* Filters for Viewing Divisions */}
            {!showDivisionForm && !showCustomLabGroupModal && (
                 <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg shadow border dark:border-gray-700">
                    <h3 className="text-lg font-medium mb-3 text-gray-700 dark:text-gray-200">Filter Divisions</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        <input type="text" name="name" placeholder="Filter by Name" value={filters.name} onChange={handleMainFilterChange} className={inputStyle} />
                        {!globalSelectedDepartment?.id && (<select name="departmentId" value={filters.departmentId} onChange={handleMainFilterChange} className={inputStyle} disabled={isLoadingDepartments}><option value="">All Depts (Local Filter)</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>)}
                        <select name="year" value={filters.year} onChange={handleMainFilterChange} className={inputStyle}><option value="">All Years</option>{YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}</select>
                        <select name="semesterType" value={filters.semesterType} onChange={handleMainFilterChange} className={inputStyle}><option value="">All Sem Types</option>{SEMESTER_TYPES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}</select>
                        <select name="divisionType" value={filters.divisionType} onChange={handleMainFilterChange} className={inputStyle}><option value="">All Div Types</option>{DIVISION_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}</select>
                        <select name="linkedSubjectType" value={filters.linkedSubjectType} onChange={handleMainFilterChange} className={inputStyle}><option value="">All Linked Subj. Types</option>{SUBJECT_TYPES_ENUM.map(st => <option key={st} value={st}>{formatSubjectType(st)}</option>)}</select>
                        <input type="text" name="courseCategory" placeholder="Filter Course Category" value={filters.courseCategory} onChange={handleMainFilterChange} className={inputStyle} />
                        <button onClick={resetMainFilters} className={`${buttonSecondaryStyle} text-xs col-span-full sm:col-span-1 lg:col-auto self-end`}>Reset Filters</button>
                    </div>
                </div>
            )}
            {/* Division Table */}
            {isLoading && <p className="text-center text-gray-600 dark:text-gray-400 py-10">Loading divisions...</p>}
            {!isLoading && divisions.length === 0 && !showDivisionForm && !showCustomLabGroupModal && <p className="text-center text-gray-600 dark:text-gray-400 py-10 bg-white dark:bg-gray-800 rounded-lg shadow">No divisions found matching criteria.</p>}
            {!isLoading && divisions.length > 0 && !showDivisionForm && !showCustomLabGroupModal && (
                <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow-lg rounded-lg border dark:border-gray-700">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700/70">
                            <tr>
                                <th className={tableHeaderStyle}>Name</th><th className={tableHeaderStyle}>Type</th>
                                <th className={tableHeaderStyle}>Linked Purpose</th> <th className={tableHeaderStyle}>Department</th>
                                <th className={tableHeaderStyle}>Yr/Sem</th> <th className={tableHeaderStyle}>Course Category</th>
                                <th className={tableHeaderStyle}>Batches (Theory/Default Composition)</th>
                                <th className={tableHeaderStyle}>Batches for Lab (or Custom Groups)</th>
                                {isAdmin && <th className={tableHeaderStyle}>Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {divisions.map(div => {
                                let labBatchesDisplay = 'N/A';
                                if (div.divisionType === 'Permanent') {
                                    labBatchesDisplay = div.batches?.length > 0 ? div.batches.map(b => b.name).join(', ') : <span className="italic text-gray-500 dark:text-gray-400">None (Manage Batches)</span>;
                                } else if (div.divisionType === 'Temporary') {
                                    if (div.applicableCustomLabGroupSet && div.applicableCustomLabGroupSet.customLabBatches?.length > 0) {
                                        labBatchesDisplay = div.applicableCustomLabGroupSet.customLabBatches.map(clg => 
                                            `${clg.name}(${(clg.composedOfPermanentBatches || []).map(b => b.name).join('+') || 'No batches'})`
                                        ).join('; ');
                                    } else if (div.composedOfPermanentBatches?.length > 0) {
                                        labBatchesDisplay = <span className="italic text-xs text-gray-500 dark:text-gray-400">Follows theory composition batches individually (no custom set defined for this context)</span>;
                                    } else {
                                        labBatchesDisplay = <span className="italic text-xs text-red-500 dark:text-red-400">Not composed for theory, lab groups undefined.</span>;
                                    }
                                }
                                return (
                                <tr key={div.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className={`${tableCellStyle} font-semibold`}>{div.name}</td>
                                    <td className={tableCellStyle}>{div.divisionType}</td>
                                    <td className={tableCellStyle}>{div.linkedSubjectType ? formatSubjectType(div.linkedSubjectType) : '-'}</td>
                                    <td className={tableCellStyle}>{div.department?.name || 'N/A'}</td>
                                    <td className={tableCellStyle}>{`Y${div.year}/S${div.semester}`}</td>
                                    <td className={tableCellStyle}>{div.courseCategory || '-'}</td>
                                    <td className={`${tableCellStyle} text-xs`}>
                                        {div.divisionType === 'Permanent' && (div.batches?.length > 0 ? div.batches.map(b => b.name).join(', ') : <span className="italic text-gray-500 dark:text-gray-400">None (Manage Batches)</span>)}
                                        {div.divisionType === 'Temporary' && (div.composedOfPermanentBatches?.length > 0 ? div.composedOfPermanentBatches.map(b => `${b.name}(${b.permanentDivision?.name || '?'})`).join('; ') : <span className="italic text-gray-500 dark:text-gray-400">Not composed</span>)}
                                    </td>
                                    <td className={`${tableCellStyle} text-xs`}>{labBatchesDisplay}</td>
                                    {isAdmin && (
                                        <td className={`${tableCellStyle} space-x-1 whitespace-nowrap`}>
                                            <button onClick={() => handleEditDivisionFormShow(div)} className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 text-xs p-1">Edit Div</button>
                                            <button onClick={() => handleDeleteDivision(div.id, div.name)} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs p-1">Del Div</button>
                                            {div.divisionType === 'Permanent' && (<button onClick={() => openBatchModal(div)} className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-xs p-1">Batches</button>)}
                                            {div.divisionType === 'Temporary' && div.linkedSubjectType && div.courseCategory && (
                                                <button 
                                                    onClick={() => openCustomLabGroupModalForEdit(div)} 
                                                    className="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 text-xs p-1"
                                                    title={div.applicableCustomLabGroupSet ? "Edit Custom Lab Groups" : "Define Custom Lab Groups for this context"}
                                                >
                                                    Custom Labs
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );})}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Batch Management Modal */}
            {isAdmin && showBatchModal && managingBatchesForDivision && (
                 <div className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-[70] flex items-center justify-center p-4">
                    <div className="relative bg-white dark:bg-gray-800 w-full max-w-lg p-6 rounded-lg shadow-xl">
                        <div className="flex justify-between items-start">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Manage Batches for Division: {managingBatchesForDivision.name}</h3>
                            <button onClick={closeBatchModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none">&times;</button>
                        </div>
                        {batchFormError && <div className="bg-red-100 text-red-700 p-2 mb-3 rounded-md text-sm" role="alert">{batchFormError}</div>}
                         <form onSubmit={handleAddOrUpdateBatch} className="mb-4 flex items-end gap-2">
                            <div className="flex-grow">
                                <label htmlFor="newBatchNameModal" className={labelStyle}>Batch Name*</label>
                                <input type="text" id="newBatchNameModal" value={newBatchName} onChange={(e) => setNewBatchName(e.target.value)} required className={inputStyle} placeholder={editingBatch ? "Edit batch name" : "e.g., A4, B_New"} />
                            </div>
                            <button type="submit" className={buttonPrimaryStyle} disabled={isLoadingBatchesInModal}>
                                {isLoadingBatchesInModal ? 'Saving...' : (editingBatch ? 'Update Batch' : 'Add Batch')}
                            </button>
                            {editingBatch && <button type="button" onClick={() => { setEditingBatch(null); setNewBatchName(''); setBatchFormError('');}} className={buttonSecondaryStyle}>Cancel Edit</button>}
                        </form>
                         {isLoadingBatchesInModal && batchesForCurrentDivision.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">Loading batches...</p>}
                        {!isLoadingBatchesInModal && batchesForCurrentDivision.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No batches yet for this division. Add one above.</p>}
                        {!isLoadingBatchesInModal && batchesForCurrentDivision.length > 0 && (
                            <ul className="max-h-60 overflow-y-auto space-y-1 border dark:border-gray-700 rounded-md p-2">
                                {batchesForCurrentDivision.map(batch => (
                                    <li key={batch.id} className="flex justify-between items-center p-1.5 bg-gray-50 dark:bg-gray-700/50 rounded text-sm">
                                        <span>{batch.name}</span>
                                        <div className="space-x-2">
                                            <button onClick={() => handleEditBatch(batch)} className="text-indigo-500 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200 text-xs" disabled={isLoadingBatchesInModal}>Edit</button>
                                            <button onClick={() => handleDeleteBatch(batch.id, batch.name)} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-xs" disabled={isLoadingBatchesInModal}>Delete</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <button onClick={closeBatchModal} className={`${buttonSecondaryStyle} mt-6 w-full`} disabled={isLoadingBatchesInModal}>Close Batch Manager</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DivisionBatchManagementPage;
