// File: client/src/pages/TimetableManagementPage.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../App';
import { useDepartment } from '../context/DepartmentContext.jsx';
import TimetableGrid from '../components/TimetableGrid.jsx';
import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';

// API Configuration
const API_BASE_URL = 'http://localhost:5001/api';

// --- Constants ---
const YEARS = [
    { value: 1, label: 'FE (First Year)' }, { value: 2, label: 'SE (Second Year)' },
    { value: 3, label: 'TE (Third Year)' }, { value: 4, label: 'BE (Fourth Year)' },
];
const SEMESTER_TYPES = [{ value: 'odd', label: 'Odd' }, { value: 'even', label: 'Even' }];
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LAB_DURATION_HOURS = 2;
const THEORY_DURATION_HOURS = 1;
const ACADEMIC_SESSION_YEARS = Array.from({ length: 10 }, (_, i) => {
    const startYear = new Date().getFullYear() - 5 + i;
    return { value: startYear.toString(), label: `${startYear}-${(startYear + 1).toString().slice(-2)}` };
});

const generateTimeOptions = (interval = 30, startHour = 8, endHour = 18) => {
    const times = [];
    for (let hour = startHour; hour < endHour; hour++) {
        for (let minute = 0; minute < 60; minute += interval) {
            times.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
        }
    }
    times.push(`${endHour.toString().padStart(2, '0')}:00`);
    return times;
};
const TIME_OPTIONS = generateTimeOptions(30, 8, 18);

const timeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return NaN;
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return NaN;
    return hours * 60 + minutes;
};

const getCalculatedEndTime = (startTime, durationHours) => {
    if (!startTime || typeof startTime !== 'string' || !startTime.includes(':') || isNaN(durationHours) || durationHours <= 0) return startTime;
    const startMinutesNum = timeToMinutes(startTime);
    if (isNaN(startMinutesNum)) return '';
    const totalEndMinutes = startMinutesNum + durationHours * 60;
    const endH = Math.floor(totalEndMinutes / 60) % 24;
    const endM = totalEndMinutes % 60;
    return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
};

// --- REFINED Toast Notification Component ---
const Toast = ({ message, type, onClose }) => {
    if (!message) return null;

    // Use a key to re-trigger the animation for new messages
    const toastKey = useMemo(() => `${message}-${type}-${Date.now()}`, [message, type]);

    // Consistent style as per user request: translucent grey box, bright white text
    const toastStyle = "bg-gray-900/90 backdrop-blur-sm border border-gray-700 text-gray-50";

    return (
        // Full-screen overlay, aligned to top with padding, content horizontally centered
        <div
            key={toastKey}
            className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-start pt-24 px-4 z-[100] animate-fadeIn"
        >
            {/* The actual toast message box */}
            <div
                className={`relative flex items-center p-4 pr-10 rounded-lg shadow-2xl w-full max-w-md text-base animate-dropDown border ${toastStyle}`}
                role="alert"
            >
                <span className="flex-grow text-center font-medium">{message}</span>
                <button
                    onClick={onClose}
                    className="absolute top-1/2 right-2 -translate-y-1/2 p-1 rounded-full text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                    aria-label="Close"
                >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path>
                    </svg>
                </button>
            </div>
             {/* JSX style tag for keyframe animations */}
            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.15s ease-out forwards;
                }
                @keyframes dropDown {
                    from {
                        transform: translateY(-80px) scale(0.95);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0) scale(1);
                        opacity: 1;
                    }
                }
                .animate-dropDown {
                    animation: dropDown 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
                }
            `}</style>
        </div>
    );
};


// --- Main Component ---
function TimetableManagementPage() {
    const { userInfo } = useAuth();
    const { departments, isLoadingDepartments, fetchDepartments, selectedDepartment: globalSelectedDepartment } = useDepartment();

    // --- UI Styles ---
    const inputStyle = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 disabled:opacity-70";
    const labelStyle = "block text-sm font-medium text-gray-700 dark:text-gray-300";
    const sectionTitleStyle = "text-xl font-semibold text-gray-800 dark:text-white mb-4 border-b pb-2 border-gray-300 dark:border-gray-700";
    const buttonPrimaryStyle = "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-50";
    const buttonSecondaryStyle = "px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100 rounded-md text-sm font-medium shadow-sm";
    const buttonDangerStyle = "px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500";


    // --- State Management ---
    const [settings, setSettings] = useState({
        departmentId: '', year: '', semesterType: '',
        academicSessionStartYear: new Date().getFullYear().toString(),
        workingDays: { Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: false },
        collegeStartTime: '09:00', collegeEndTime: '17:00', primaryBreakStartTime: '12:00',
        useAlternateBreaks: false, alternateBreakAssignments: [],
        alternateBreak1StartTime: '13:00', alternateBreak2StartTime: '14:00',
        labTimings: {
            labTimingType: 'General', generalSlotsCount: 0, generalSlots: [],
            specificSlots: [],
        },
        theoryTimings: {
            isSpecific: false, DLO: [], ILOT: [], MajorMinor: [],
        },
        enableFloorPreferences: false,
        floorPreferences: { Common: '', DLO: '', ILOT: '', MajorMinor: '', Labs: '' },
    });

    const [presets, setPresets] = useState([]);
    const [loadedPresetId, setLoadedPresetId] = useState(null);
    const [newPresetName, setNewPresetName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    // State for the new toast component
    const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

    const [assignableData, setAssignableData] = useState({ subjects: [], divisions: [] });
    const [isLabAssignModalOpen, setIsLabAssignModalOpen] = useState(false);
    const [editingLabSlotIndex, setEditingLabSlotIndex] = useState(null);
    const [tempAssignments, setTempAssignments] = useState([]);
    const [generatedTimetable, setGeneratedTimetable] = useState(null);
    const [showTimetableDisplay, setShowTimetableDisplay] = useState(false);
    const [fetchedDataForDisplay, setFetchedDataForDisplay] = useState(null);
    const [viewMode, setViewMode] = useState('division');
    const [timetableToDisplay, setTimetableToDisplay] = useState([]);
    const timetableGridRef = useRef(null);
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [divisionsForDisplay, setDivisionsForDisplay] = useState([]);
    const [selectedDivisionForDisplay, setSelectedDivisionForDisplay] = useState('');
    const [facultyForDisplay, setFacultyForDisplay] = useState([]);
    const [selectedFacultyForDisplay, setSelectedFacultyForDisplay] = useState('');
    const [roomsForDisplay, setRoomsForDisplay] = useState([]);
    const [selectedRoomForDisplay, setSelectedRoomForDisplay] = useState('');
    const [showSlotDetailModal, setShowSlotDetailModal] = useState(false);
    const [selectedSlotDetails, setSelectedSlotDetails] = useState(null);
    const [isEditingSlot, setIsEditingSlot] = useState(false);
    const [editSlotFormData, setEditSlotFormData] = useState({ day: '', startTime: '', roomId: '', facultyId: '' });
    const [editingSlotOriginalData, setEditingSlotOriginalData] = useState(null);
    const [courseGroups, setCourseGroups] = useState({ DLO: [], ILOT: [], MajorMinor: [] });
    const [allDivisionsForAltBreak, setAllDivisionsForAltBreak] = useState([]);
    
    // NEW STATE: To hold the detailed list of unassigned tasks
    const [unassignedTaskDetails, setUnassignedTaskDetails] = useState([]);
    // NEW STATE: To control the visibility of the unassigned tasks modal
    const [isUnassignedModalOpen, setIsUnassignedModalOpen] = useState(false);


    const basicConfigComplete = useMemo(() => {
        return settings.departmentId && settings.year && settings.semesterType;
    }, [settings.departmentId, settings.year, settings.semesterType]);

    // --- Toast Handler ---
    const showToast = (message, type = 'info', duration = 4000) => {
        setToast({ show: true, message, type });
        // Auto-close the toast after the specified duration
        setTimeout(() => {
            // Only close if the message is still the same, prevents premature closing of a new toast
            setToast(prev => (prev.message === message ? { show: false, message: '', type: 'info' } : prev));
        }, duration);
    };

    const closeToast = () => {
        setToast({ show: false, message: '', type: 'info' });
    };

    useEffect(() => {
        if (globalSelectedDepartment) {
            setSettings(s => ({ ...s, departmentId: globalSelectedDepartment.id.toString() }));
        }
        if (departments.length === 0 && !isLoadingDepartments) {
            fetchDepartments();
        }
    }, [globalSelectedDepartment, departments, isLoadingDepartments, fetchDepartments]);

    const fetchPresets = useCallback(async () => {
        if (!basicConfigComplete) {
            setPresets([]);
            return;
        }
        setIsLoading(true);
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.get(`${API_BASE_URL}/timetable/presets`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { departmentId: settings.departmentId, year: settings.year, semesterType: settings.semesterType },
            });
            setPresets(response.data || []);
        } catch (err) {
            setError("Failed to fetch presets. " + (err.response?.data?.message || err.message));
        } finally {
            setIsLoading(false);
        }
    }, [basicConfigComplete, settings.departmentId, settings.year, settings.semesterType]);

    useEffect(() => { fetchPresets(); }, [fetchPresets]);

    // Wrapper to clear loaded preset status on any manual change
    const handleSettingsUpdate = (updateLogic) => {
        setSettings(updateLogic);
        if (loadedPresetId) {
            setLoadedPresetId(null);
        }
    };

    const fetchCourseGroupsCallback = useCallback(async () => {
        if (!basicConfigComplete) {
            setCourseGroups({ DLO: [], ILOT: [], MajorMinor: [] });
            return;
        }
        setIsLoading(true);
        const token = localStorage.getItem('authToken');
        try {
            const response = await axios.get(`${API_BASE_URL}/timetable/subjects/distinct-course-groups`, {
                params: { departmentId: settings.departmentId, year: settings.year, semesterType: settings.semesterType },
                headers: { Authorization: `Bearer ${token}` }
            });
            setCourseGroups(response.data || { DLO: [], ILOT: [], MajorMinor: [] });
        } catch (err) {
            setError("Failed to fetch course groups for theory section. " + (err.response?.data?.message || err.message));
            setCourseGroups({ DLO: [], ILOT: [], MajorMinor: [] });
        } finally {
            setIsLoading(false);
        }
    }, [basicConfigComplete, settings.departmentId, settings.year, settings.semesterType]);

    useEffect(() => { fetchCourseGroupsCallback(); }, [fetchCourseGroupsCallback]);

    const fetchAssignableData = useCallback(async () => {
        if (!basicConfigComplete) {
            setAssignableData({ subjects: [], divisions: [] });
            return;
        }
        setIsLoading(true);
        const token = localStorage.getItem('authToken');
        try {
            const [subjectsRes, divisionsRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/subjects`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { departmentId: settings.departmentId, year: settings.year, semesterType: settings.semesterType }
                }),
                axios.get(`${API_BASE_URL}/divisions`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { departmentId: settings.departmentId, year: settings.year, semesterType: settings.semesterType, includeBatches: true, includeCustomGroups: true }
                })
            ]);
            setAssignableData({
                subjects: (subjectsRes.data || []),
                divisions: (divisionsRes.data || []),
            });
        } catch (err) {
            setError("Failed to load subjects/divisions for assignments. " + (err.response?.data?.message || err.message));
        } finally {
            setIsLoading(false);
        }
    }, [basicConfigComplete, settings.departmentId, settings.year, settings.semesterType]);

    useEffect(() => {
        if (settings.labTimings.labTimingType === 'Specific' || settings.theoryTimings.isSpecific) {
            fetchAssignableData();
        }
    }, [settings.labTimings.labTimingType, settings.theoryTimings.isSpecific, fetchAssignableData]);

    const fetchAllDivisionsForAltBreakAssignment = useCallback(async () => {
        if (!basicConfigComplete) {
            setAllDivisionsForAltBreak([]);
            handleSettingsUpdate(s => ({ ...s, alternateBreakAssignments: [] }));
            return;
        }
        const token = localStorage.getItem('authToken');
        setIsLoading(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/divisions`, {
                params: { departmentId: settings.departmentId, year: settings.year, semesterType: settings.semesterType },
                headers: { Authorization: `Bearer ${token}` }
            });

            const permanentCommonDivisions = (response.data || []).filter(d =>
                d.divisionType === 'Permanent' && (!d.linkedSubjectType || d.linkedSubjectType === 'Common')
            );

            setAllDivisionsForAltBreak(permanentCommonDivisions);
            handleSettingsUpdate(s => ({
                ...s,
                alternateBreakAssignments: permanentCommonDivisions.map(pd => ({
                    divisionId: pd.id.toString(),
                    divisionName: pd.name,
                    breakStartTime: s.alternateBreakAssignments.find(a => a.divisionId === pd.id.toString())?.breakStartTime || ''
                }))
            }));
        } catch (err) {
            setError("Could not load divisions for alternate break assignment.");
        } finally {
            setIsLoading(false);
        }
    }, [basicConfigComplete, settings.departmentId, settings.year, settings.semesterType]);

    useEffect(() => {
        if (settings.useAlternateBreaks && basicConfigComplete) {
            fetchAllDivisionsForAltBreakAssignment();
        } else {
            setAllDivisionsForAltBreak([]);
            if(!settings.useAlternateBreaks){
                 handleSettingsUpdate(s => ({ ...s, alternateBreakAssignments: [] }));
            }
        }
    }, [settings.useAlternateBreaks, fetchAllDivisionsForAltBreakAssignment, basicConfigComplete]);

    const handleSettingChange = (e) => {
        const { name, value, type, checked } = e.target;
        handleSettingsUpdate(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSavePreset = async () => {
        if (!newPresetName.trim() || !basicConfigComplete) {
            setError("Preset name and basic configuration are required.");
            return;
        }
        const existingPreset = presets.find(p => p.name.toLowerCase() === newPresetName.trim().toLowerCase());
        if (existingPreset && !window.confirm(`A preset named "${newPresetName}" already exists. Do you want to overwrite it?`)) {
            return;
        }

        setError('');
        setIsLoading(true);
        const token = localStorage.getItem('authToken');
        const { departmentId, year, semesterType, academicSessionStartYear, ...rulesToSave } = settings;

        try {
            const response = await axios.post(`${API_BASE_URL}/timetable/presets`, {
                name: newPresetName.trim(), departmentId: parseInt(departmentId), year: parseInt(year),
                semesterType: semesterType, settings: rulesToSave,
            }, { headers: { Authorization: `Bearer ${token}` } });

            showToast(response.data.message || `Preset '${newPresetName}' saved successfully.`, 'success');
            setLoadedPresetId(response.data.preset.id); // Set the newly saved/updated preset as active
            fetchPresets();
        } catch (err) {
            setError("Failed to save preset. " + (err.response?.data?.message || err.message));
        } finally {
            setIsLoading(false);
        }
    };

    const handleLoadPreset = (presetIdToLoad) => {
        if (!presetIdToLoad) return;
        const presetToLoad = presets.find(p => p.id === parseInt(presetIdToLoad));
        if (presetToLoad && presetToLoad.settings) {
            const loadedSettings = JSON.parse(JSON.stringify(presetToLoad.settings));
            setSettings(prev => ({
                ...prev, // Keep basic config
                ...loadedSettings, // Load rules from preset
            }));
            setNewPresetName(presetToLoad.name);
            setLoadedPresetId(presetToLoad.id);
            showToast(`Preset '${presetToLoad.name}' loaded successfully.`, 'success');
        } else {
            showToast(`Could not find or load preset.`, 'error');
        }
    };

    const handleDownloadPreset = async (presetId) => {
        const preset = presets.find(p => p.id === presetId);
        if (!preset) {
            showToast('Preset not found.', 'error');
            return;
        }

        setIsLoading(true);
        showToast('Preparing download...', 'info');
        const token = localStorage.getItem('authToken');

        try {
            // Fetch the required data on-demand for the preset's context
            const [subjectsRes, divisionsRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/subjects`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { departmentId: preset.departmentId, year: preset.year, semesterType: preset.semesterType }
                }),
                axios.get(`${API_BASE_URL}/divisions`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { departmentId: preset.departmentId, year: preset.year, semesterType: preset.semesterType, includeBatches: true, includeCustomGroups: true }
                })
            ]);

            const exportSubjects = subjectsRes.data || [];
            const exportDivisions = divisionsRes.data || [];
            const allBatchesAndGroups = exportDivisions.flatMap(d => [
                ...(d.batches || []).map(b => ({ ...b, isCustom: false })),
                ...(d.applicableCustomLabGroupSet?.customLabBatches || []).map(b => ({ ...b, isCustom: true }))
            ]);


            const settings = preset.settings;
            const dataToExport = [];

            // Add a title
            dataToExport.push([`Preset: ${preset.name}`]);
            dataToExport.push([]); // Spacer row

            // Basic settings
            dataToExport.push(['Setting', 'Value']);
            dataToExport.push(['Academic Session', settings.academicSessionStartYear]);
            dataToExport.push(['College Start Time', settings.collegeStartTime]);
            dataToExport.push(['College End Time', settings.collegeEndTime]);
            dataToExport.push(['Primary Break Start', settings.primaryBreakStartTime]);
            dataToExport.push(['Working Days', Object.entries(settings.workingDays).filter(([, v]) => v).map(([k]) => k).join(', ')]);
            dataToExport.push([]);

            // Lab Timings
            dataToExport.push(['Lab Timings']);
            if (settings.labTimings.labTimingType === 'General') {
                dataToExport.push(['Type', 'General']);
                dataToExport.push(['Day', 'Start Time', 'End Time']);
                settings.labTimings.generalSlots.forEach(slot => {
                    dataToExport.push([slot.dayOfWeek, slot.startTime, slot.endTime]);
                });
            } else {
                dataToExport.push(['Type', 'Specific']);
                dataToExport.push(['Day', 'Start Time', 'End Time', 'Subject', 'Batch/Group']);
                settings.labTimings.specificSlots.forEach(slot => {
                    slot.assignments.forEach(assign => {
                        const subject = exportSubjects.find(s => s.id === assign.subjectId)?.name || 'Unknown Subject';
                        let batchOrGroupName = 'Unknown Batch/Group';
                        const entityId = assign.isCustomGroup ? assign.customLabBatchId : assign.batchId;
                        const foundEntity = allBatchesAndGroups.find(b => b.id === entityId);
                        if (foundEntity) {
                            batchOrGroupName = `${foundEntity.name}${foundEntity.isCustom ? ' (Custom)' : ''}`;
                        }

                        dataToExport.push([slot.dayOfWeek, slot.startTime, slot.endTime, subject, batchOrGroupName]);
                    });
                });
            }
            dataToExport.push([]);

            // Theory Timings
            if (settings.theoryTimings.isSpecific) {
                dataToExport.push(['Theory Timings']);
                dataToExport.push(['Group Type', 'Course Group', 'Day', 'Start Time', 'Subject Hint']);
                ['DLO', 'ILOT', 'MajorMinor'].forEach(type => {
                    settings.theoryTimings[type].forEach(rule => {
                        dataToExport.push([type, rule.courseGroup, rule.day, rule.startTime, rule.subjectNameHint]);
                    });
                });
            }

            const worksheet = XLSX.utils.aoa_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'PresetData');
            XLSX.writeFile(workbook, `Preset_${preset.name}.xlsx`);
            showToast('Preset data exported successfully!', 'success');
        } catch (err) {
            console.error("Error exporting preset:", err);
            showToast('Failed to export preset data. '  + (err.response?.data?.message || err.message), 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeletePreset = async (presetIdToDelete) => {
        const presetToDelete = presets.find(p => p.id === presetIdToDelete);
        if (!presetToDelete || !window.confirm(`Are you sure you want to delete the preset "${presetToDelete.name}"?`)) return;

        setError(''); setIsLoading(true);
        const token = localStorage.getItem('authToken');
        try {
            await axios.delete(`${API_BASE_URL}/timetable/presets/${presetIdToDelete}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            showToast(`Preset '${presetToDelete.name}' deleted.`, 'info');
            if (loadedPresetId === presetIdToDelete) setLoadedPresetId(null);
            setNewPresetName('');
            fetchPresets();
        } catch (err) {
            setError("Failed to delete preset. " + (err.response?.data?.message || err.message));
        } finally {
            setIsLoading(false);
        }
    };

    const handleWorkingDayChange = (day) => {
        handleSettingsUpdate(prev => ({ ...prev, workingDays: { ...prev.workingDays, [day]: !prev.workingDays[day] } }));
    };

    const handleAlternateBreakAssignmentChange = (divisionId, breakStartTime) => {
        handleSettingsUpdate(prev => ({
            ...prev,
            alternateBreakAssignments: prev.alternateBreakAssignments.map(a =>
                a.divisionId === divisionId ? { ...a, breakStartTime } : a
            )
        }));
    };

    const handleFloorPreferenceChange = (groupType, value) => {
        handleSettingsUpdate(prev => ({ ...prev, floorPreferences: { ...prev.floorPreferences, [groupType]: value } }));
    };

    const handleLabTimingTypeChange = (type) => handleSettingsUpdate(s => ({ ...s, labTimings: { ...s.labTimings, labTimingType: type, generalSlots:[], specificSlots:[] } }));

    const handleGeneralSlotsCountChange = (e) => {
        let count = parseInt(e.target.value) || 0;
        count = Math.max(0, Math.min(20, count));
        handleSettingsUpdate(s => {
            const newSlots = Array.from({ length: count }, (_, i) =>
                s.labTimings.generalSlots[i] || { dayOfWeek: 'Monday', startTime: '15:00', endTime: getCalculatedEndTime('15:00', LAB_DURATION_HOURS) }
            );
            return { ...s, labTimings: { ...s.labTimings, generalSlotsCount: count, generalSlots: newSlots } };
        });
    };

    const handleGeneralSlotDetailChange = (index, field, value) => {
        handleSettingsUpdate(s => {
            const newSlots = [...s.labTimings.generalSlots];
            newSlots[index] = { ...newSlots[index], [field]: value };
            if (field === 'startTime') newSlots[index].endTime = getCalculatedEndTime(value, LAB_DURATION_HOURS);
            return { ...s, labTimings: { ...s.labTimings, generalSlots: newSlots } };
        });
    };

    const addSpecificLabSlot = () => handleSettingsUpdate(s => ({ ...s, labTimings: { ...s.labTimings, specificSlots: [...s.labTimings.specificSlots, { dayOfWeek: 'Monday', startTime: '15:00', endTime: getCalculatedEndTime('15:00', LAB_DURATION_HOURS), assignments: [] }] } }));

    const removeSpecificLabSlot = (index) => handleSettingsUpdate(s => ({ ...s, labTimings: { ...s.labTimings, specificSlots: s.labTimings.specificSlots.filter((_, i) => i !== index) } }));

    const handleSpecificLabSlotDetailChange = (index, field, value) => handleSettingsUpdate(s => {
        const newSlots = [...s.labTimings.specificSlots];
        newSlots[index] = { ...newSlots[index], [field]: value };
        if (field === 'startTime') newSlots[index].endTime = getCalculatedEndTime(value, LAB_DURATION_HOURS);
        return { ...s, labTimings: { ...s.labTimings, specificSlots: newSlots } };
    });

    const openLabAssignModal = (index) => {
        setEditingLabSlotIndex(index);
        const currentAssignments = settings.labTimings.specificSlots[index]?.assignments || [];
        setTempAssignments(JSON.parse(JSON.stringify(currentAssignments)));
        setIsLabAssignModalOpen(true);
    };

    const closeLabAssignModal = () => { setIsLabAssignModalOpen(false); setEditingLabSlotIndex(null); setTempAssignments([]); };

    const addTempAssignment = (assignment) => {
        const subjectId = parseInt(assignment.subjectId);
        const isCustom = assignment.isCustomGroup;
        const entityId = parseInt(isCustom ? assignment.customLabBatchId : assignment.batchId);

        const key = `${subjectId}-${entityId}-${isCustom}`;
        const existingAssignments = new Set(tempAssignments.map(a => `${a.subjectId}-${a.isCustomGroup ? a.customLabBatchId : a.batchId}-${a.isCustomGroup}`));

        if (existingAssignments.has(key)) {
            alert("This assignment already exists in this slot.");
            return;
        }
        setTempAssignments([...tempAssignments, assignment]);
    };

    const removeTempAssignment = (index) => setTempAssignments(tempAssignments.filter((_, i) => i !== index));

    const saveAssignmentsToSettings = () => {
        if (editingLabSlotIndex === null) return;
        handleSettingsUpdate(s => {
            const newSpecificSlots = [...s.labTimings.specificSlots];
            newSpecificSlots[editingLabSlotIndex].assignments = tempAssignments;
            return { ...s, labTimings: { ...s.labTimings, specificSlots: newSpecificSlots } };
        });
        closeLabAssignModal();
    };

    const handleTheoryTimingChange = (groupType, index, field, value) => {
        handleSettingsUpdate(prev => {
            const updatedTimings = [...(prev.theoryTimings[groupType] || [])];
            if (updatedTimings[index]) {
                updatedTimings[index] = { ...updatedTimings[index], [field]: value };
            }
            return { ...prev, theoryTimings: { ...prev.theoryTimings, [groupType]: updatedTimings } };
        });
    };

    const addTheoryTimingSlot = (groupType, groupName = '') => {
        handleSettingsUpdate(prev => ({
            ...prev, theoryTimings: { ...prev.theoryTimings, [groupType]: [...(prev.theoryTimings[groupType] || []), { courseGroup: groupName, day: 'Monday', startTime: '09:00', subjectNameHint: '' }] }
        }));
    };

    const removeTheoryTimingSlot = (groupType, index) => {
        handleSettingsUpdate(prev => ({ ...prev, theoryTimings: { ...prev.theoryTimings, [groupType]: (prev.theoryTimings[groupType] || []).filter((_, i) => i !== index) } }));
    };

    const handleGenerateTimetable = async () => {
        setError('');
        showToast('Generating timetable... This may take a few moments.', 'info', 15000);
        setIsLoading(true);
        setGeneratedTimetable(null);
        setShowTimetableDisplay(false);
        setUnassignedTaskDetails([]); // Reset previous details

        const token = localStorage.getItem('authToken');
        try {
            const response = await axios.post(`${API_BASE_URL}/timetable/generate`, settings, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            // Destructure the new detailed list from the response
            const { timetable, fetchedDataSummary, message, unassignedTaskCount, unassignedTaskDetails: detailedReasons } = response.data;
            
            setGeneratedTimetable(timetable || []);
            setFetchedDataForDisplay(fetchedDataSummary || {});
            setUnassignedTaskDetails(detailedReasons || []); // Store the detailed reasons

            let statusMsg = message || "Timetable generated successfully.";
            let toastType = 'success';

            if (unassignedTaskCount > 0 && Array.isArray(detailedReasons)) {
                 // Update the toast message to be more informative
                 statusMsg += ` Warning: ${unassignedTaskCount} tasks could not be scheduled. Click 'View Unassigned' for details.`;
                 toastType = 'warning';
            }

            showToast(statusMsg, toastType, 10000); // Increased duration for the more detailed message
            setShowTimetableDisplay(true);

            const commonPermanentDivisions = (fetchedDataSummary?.divisionsData || [])
                .filter(d => d.divisionType === 'Permanent' && (!d.linkedSubjectType || d.linkedSubjectType === 'Common'))
                .sort((a, b) => a.name.localeCompare(b.name));
            setDivisionsForDisplay(commonPermanentDivisions);
            setFacultyForDisplay((fetchedDataSummary?.facultyData || []).sort((a,b) => a.name.localeCompare(b.name)));
            setRoomsForDisplay((fetchedDataForDisplay?.roomData || []).sort((a,b) => (a.roomNumber || '').localeCompare(b.roomNumber || '')));

            if(commonPermanentDivisions.length > 0) {
                 setSelectedDivisionForDisplay(commonPermanentDivisions[0].id.toString());
            }

        } catch (err) {
            const errorMsg = "Timetable generation failed. " + (err.response?.data?.message || err.message);
            setError(errorMsg);
            showToast(errorMsg, 'error', 8000);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!generatedTimetable || !fetchedDataForDisplay?.divisionsData) {
            setTimetableToDisplay([]);
            return;
        }

        let finalSlots = [];

        if (viewMode === 'division' && selectedDivisionForDisplay) {
            const divisionIdInt = parseInt(selectedDivisionForDisplay);
            const allSlotsForDivision = generatedTimetable.filter(slot => slot.originalTask?.divisionId === divisionIdInt || slot.slotCategory === 'Event_Scheduled');

            // --- Grouping Logic ---
            // 1. Identify all unique theory and lab groups by their time slot.
            const theoryGroups = new Map(); // key: 'day-time-group', value: backend display slot
            const labGroups = new Map(); // key: 'day-time', value: array of individual lab slots

            allSlotsForDivision.forEach(slot => {
                const task = slot.originalTask;
                if (!task) return;

                // A. Capture backend-defined theory group displays
                if (task.taskId?.startsWith('DISPLAY_') && task.displayCourseGroup) {
                    const timeKey = `${slot.dayOfWeek}-${slot.startTime}-${task.courseGroup}`;
                    theoryGroups.set(timeKey, slot);
                }
                // B. Capture all individual lab slots to be grouped manually
                else if (slot.slotCategory === 'Lab') {
                    const timeKey = `${slot.dayOfWeek}-${slot.startTime}`;
                    if (!labGroups.has(timeKey)) labGroups.set(timeKey, []);
                    labGroups.get(timeKey).push(slot);
                }
            });

            // 2. Create frontend-display-slots for labs that have multiple concurrent sessions.
            const labDisplaySlots = [];
            labGroups.forEach((labs, timeKey) => {
                if (labs.length > 1) {
                    const firstLab = labs[0];
                    labDisplaySlots.push({
                        ...firstLab,
                        key: `display-lab-${timeKey}`,
                        subjectName: 'Practical / Lab Session',
                        subjectCode: 'LAB',
                        facultyName: 'Multiple',
                        roomNumber: 'Multiple',
                        originalTask: {
                            ...firstLab.originalTask,
                            taskId: `DISPLAY_LAB_${timeKey}`, // Synthetic ID for click handling
                            isFrontendGrouped: true, // Flag to identify this as a frontend-created group
                        },
                    });
                }
            });

            // 3. Combine all slots for rendering, avoiding duplicates.
            const displayableSlots = new Set();

            // Add all theory group display markers
            theoryGroups.forEach(slot => displayableSlots.add(slot));

            // Add all lab group display markers
            labDisplaySlots.forEach(slot => displayableSlots.add(slot));

            // Add individual slots, but only if they are not part of a group that has a display marker.
            allSlotsForDivision.forEach(slot => {
                const task = slot.originalTask;
                if (!task) return;

                // Check if it's part of a theory group
                const theoryTimeKey = `${slot.dayOfWeek}-${slot.startTime}-${task.courseGroup}`;
                const isPartOfTheoryGroup = task.courseGroup && theoryGroups.has(theoryTimeKey);

                // Check if it's part of a lab group
                const labTimeKey = `${slot.dayOfWeek}-${slot.startTime}`;
                const isPartOfLabGroup = slot.slotCategory === 'Lab' && labGroups.has(labTimeKey) && labGroups.get(labTimeKey).length > 1;

                if (!isPartOfTheoryGroup && !isPartOfLabGroup) {
                    displayableSlots.add(slot);
                }
            });

            // Add department-wide events
            generatedTimetable.forEach(slot => {
                if (slot.slotCategory === 'Event_Scheduled') {
                     const eventDeptId = slot.originalTask?.eventDepartmentId;
                    if (!eventDeptId || eventDeptId === parseInt(settings.departmentId)) displayableSlots.add(slot);
                }
            });

            finalSlots = Array.from(displayableSlots);

        } else if (viewMode === 'faculty' && selectedFacultyForDisplay) {
            const facultyIdInt = parseInt(selectedFacultyForDisplay);
            finalSlots = generatedTimetable.filter(slot =>
                (slot.originalTask?.facultyId === facultyIdInt && !slot.originalTask.taskId?.startsWith('DISPLAY_')) || slot.slotCategory === 'Event_Scheduled'
            );
        } else if (viewMode === 'room' && selectedRoomForDisplay) {
            const roomIdInt = parseInt(selectedRoomForDisplay);
            finalSlots = generatedTimetable.filter(slot =>
                (slot.roomId === roomIdInt && slot.originalTask && !slot.originalTask.taskId?.startsWith('DISPLAY_')) ||
                (slot.slotCategory === 'Event_Scheduled' && (slot.originalTask?.allRoomIds || [slot.roomId]).includes(roomIdInt))
            );
        }

        setTimetableToDisplay(finalSlots.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)));
    }, [generatedTimetable, selectedDivisionForDisplay, fetchedDataForDisplay, viewMode, selectedFacultyForDisplay, selectedRoomForDisplay, settings.departmentId]);

    const handleSaveReviewedTimetable = async () => {
        if (!generatedTimetable || userInfo?.role !== 'Admin') return;
        setIsLoading(true); showToast("Saving timetable...", 'info');
        const token = localStorage.getItem('authToken');

        const academicSlotsToSave = generatedTimetable
            .filter(s => s.slotCategory !== 'Event_Scheduled' && s.originalTask && !s.unassigned && !s.originalTask.taskId?.startsWith('DISPLAY_'))
            .map(s => ({
                dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, slotCategory: s.slotCategory,
                roomId: s.roomId, divisionId: s.originalTask.divisionId, subjectId: s.originalTask.subjectId,
                facultyId: s.originalTask.facultyId, batchId: (s.originalTask.batchId && !s.originalTask.isCustomLabGroup) ? s.originalTask.batchId : null,
            })).filter(Boolean);

        if (academicSlotsToSave.length === 0) {
            setError("No valid academic slots to save."); setIsLoading(false); return;
        }

        try {
            await axios.post(`${API_BASE_URL}/timetable/save-slots`, {
                departmentId: settings.departmentId, year: settings.year, semesterType: settings.semesterType,
                academicSessionStartYear: settings.academicSessionStartYear, slots: academicSlotsToSave
            }, { headers: { Authorization: `Bearer ${token}` }});
            showToast("Timetable saved successfully!", 'success');
            setShowTimetableDisplay(false); setGeneratedTimetable(null);
        } catch (err) {
            const errorMsg = "Failed to save timetable: " + (err.response?.data?.message || err.message);
            setError(errorMsg); showToast(errorMsg, 'error');
        } finally { setIsLoading(false); }
    };

    const handleInitiatePrint = () => {
        const hasSelection = (viewMode === 'division' && selectedDivisionForDisplay) || (viewMode === 'faculty' && selectedFacultyForDisplay) || (viewMode === 'room' && selectedRoomForDisplay);
        if (!hasSelection || timetableToDisplay.length === 0) { alert("Please select an item to preview and print."); return; }
        setShowPrintPreview(true);
    };

    const handleActualPdfSave = () => {
        const input = timetableGridRef.current; if (!input) return;
        const printHeader = input.querySelector('.print-header');
        const printFooter = input.querySelector('.print-footer');
        if (printHeader) printHeader.style.display = 'flex'; if (printFooter) printFooter.style.display = 'flex';

        html2canvas(input, { scale: 2, useCORS: true }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
            const margin = 8;
            const pdfPageWidth = pdf.internal.pageSize.getWidth(); const pdfPageHeight = pdf.internal.pageSize.getHeight();
            const contentWidth = pdfPageWidth - 2 * margin; const contentHeight = pdfPageHeight - 2 * margin;
            const canvasAspectRatio = canvas.width / canvas.height;
            let imgRenderWidth = contentWidth; let imgRenderHeight = contentWidth / canvasAspectRatio;

            if (imgRenderHeight > contentHeight) { imgRenderHeight = contentHeight; imgRenderWidth = contentHeight * canvasAspectRatio; }
            const x = margin + (contentWidth - imgRenderWidth) / 2; const y = margin;

            pdf.addImage(imgData, 'PNG', x, y, imgRenderWidth, imgRenderHeight);

            let contextName = viewMode === 'division' ? divisionsForDisplay.find(d=>d.id.toString() === selectedDivisionForDisplay)?.name :
                              viewMode === 'faculty' ? facultyForDisplay.find(f=>f.id.toString() === selectedFacultyForDisplay)?.name :
                              roomsForDisplay.find(r=>r.id.toString() === selectedRoomForDisplay)?.roomNumber;
            const fileName = `Timetable_${(contextName || "timetable").replace(/\s/g, '_')}.pdf`;
            pdf.save(fileName);

            if (printHeader) printHeader.style.display = ''; if (printFooter) printFooter.style.display = '';
            setShowPrintPreview(false);
        }).catch(err => {
            setShowPrintPreview(false); alert("Failed to generate PDF.");
        });
    };

    const handleSlotClick = (slotDataFromGrid) => {
        if (!slotDataFromGrid) {
            setSelectedSlotDetails({ isEmpty: true });
        } else if (slotDataFromGrid.originalTask) {
            const task = slotDataFromGrid.originalTask;
            let detailedSlotInfo = { ...slotDataFromGrid, isEditable: false, isCourseGroup: false, isLabGroup: false };

            if (task.taskId?.startsWith('DISPLAY_')) {
                // Handle frontend-grouped labs
                if (task.isFrontendGrouped) {
                    detailedSlotInfo.isLabGroup = true;
                    detailedSlotInfo.tasks = (generatedTimetable || []).filter(s =>
                        s.slotCategory === 'Lab' &&
                        s.dayOfWeek === slotDataFromGrid.dayOfWeek &&
                        s.startTime === slotDataFromGrid.startTime &&
                        s.originalTask?.divisionId === task.divisionId
                    );
                // Handle backend-grouped theory lectures
                } else {
                    detailedSlotInfo.isCourseGroup = true;
                    detailedSlotInfo.tasks = (generatedTimetable || []).filter(s =>
                        s.dayOfWeek === slotDataFromGrid.dayOfWeek &&
                        s.startTime === slotDataFromGrid.startTime &&
                        s.originalTask?.courseGroup === task.courseGroup &&
                        s.originalTask?.subjectType === task.subjectType &&
                        !s.originalTask.taskId?.startsWith('DISPLAY_')
                    );
                }
            } else if (slotDataFromGrid.slotCategory !== 'Event_Scheduled' && !task.isFixed) {
                detailedSlotInfo.isEditable = true;
            }
            setSelectedSlotDetails(detailedSlotInfo);
        } else {
            setSelectedSlotDetails(slotDataFromGrid);
        }
        setShowSlotDetailModal(true);
        setIsEditingSlot(false);
    };

    const handleOpenEditModal = (slotToEdit) => {
        if (!slotToEdit || !slotToEdit.isEditable) return;
        setEditingSlotOriginalData(slotToEdit);
        setEditSlotFormData({
            day: slotToEdit.dayOfWeek, startTime: slotToEdit.startTime,
            roomId: slotToEdit.roomId || '', facultyId: slotToEdit.originalTask.facultyId || '',
        });
        setIsEditingSlot(true);
    };

    const handleCloseSlotDetailModal = () => { setShowSlotDetailModal(false); setSelectedSlotDetails(null); setEditingSlotOriginalData(null); setIsEditingSlot(false); };

    const handleEditSlotFormChange = (e) => { const { name, value } = e.target; setEditSlotFormData(prev => ({ ...prev, [name]: value })); };

    const handleSaveChangesToSlot = () => {
        if (!editingSlotOriginalData) return;
        let clashDetected = false; let clashMessage = "Clash detected: \n";
        const editedDay = editSlotFormData.day; const editedStartTime = editSlotFormData.startTime;
        const editedRoomId = parseInt(editSlotFormData.roomId); const editedFacultyId = parseInt(editSlotFormData.facultyId);
        const taskDuration = editingSlotOriginalData.originalTask.duration; const editedEndTime = getCalculatedEndTime(editedStartTime, taskDuration);

        for (const slot of generatedTimetable) {
            if (slot.originalTask?.taskId === editingSlotOriginalData.originalTask?.taskId) continue;
            if (slot.unassigned || !slot.dayOfWeek || !slot.startTime) continue;
            if (slot.dayOfWeek === editedDay) {
                const existingStartMins = timeToMinutes(slot.startTime); const existingEndMins = timeToMinutes(slot.endTime);
                const editedStartMins = timeToMinutes(editedStartTime); const editedEndMins = timeToMinutes(editedEndTime);
                if (editedStartMins < existingEndMins && editedEndMins > existingStartMins) {
                    if (slot.roomId === editedRoomId) { clashDetected = true; clashMessage += `- Room is occupied.\n`; }
                    if (slot.originalTask?.facultyId === editedFacultyId) { clashDetected = true; clashMessage += `- Faculty is busy.\n`; }
                }
            }
        }
        if (clashDetected) { alert(clashMessage); return; }

        const updatedTimetable = generatedTimetable.map(slot => {
            if (slot.originalTask?.taskId === editingSlotOriginalData.originalTask?.taskId) {
                const newRoom = fetchedDataForDisplay.roomData.find(r => r.id === editedRoomId);
                const newFaculty = fetchedDataForDisplay.facultyData.find(f => f.id === editedFacultyId);
                return {
                    ...slot, dayOfWeek: editedDay, startTime: editedStartTime, endTime: editedEndTime,
                    roomId: newRoom?.id, roomNumber: newRoom?.roomNumber, facultyId: newFaculty?.id, facultyName: newFaculty?.name,
                    originalTask: { ...slot.originalTask, facultyId: newFaculty?.id }, isModified: true
                };
            }
            return slot;
        });
        setGeneratedTimetable(updatedTimetable);
        showToast("Slot updated locally. Save to persist changes.", 'info'); handleCloseSlotDetailModal();
    };

    const handleSlotDrop = (draggedSlotData, targetDay, targetStartTime) => {
        if (!draggedSlotData.isEditable) return;
        const updatedTimetable = generatedTimetable.map(slot => {
            if (slot.originalTask?.taskId === draggedSlotData.originalTask.taskId) {
                return {
                    ...slot, dayOfWeek: targetDay, startTime: targetStartTime,
                    endTime: getCalculatedEndTime(targetStartTime, slot.originalTask.duration), isModified: true
                };
            }
            return slot;
        });
        setGeneratedTimetable(updatedTimetable);
        showToast("Slot moved locally. Save to persist changes.", 'info');
    };

    const AssignmentAdder = ({ onAdd, isLab, slotIndex }) => {
        const [selectedSubjectId, setSelectedSubjectId] = useState('');
        const [selectedEntityId, setSelectedEntityId] = useState('');

        const availableEntities = useMemo(() => {
            if (!selectedSubjectId) return { entities: [], type: isLab ? 'Batch' : 'Division' };
            const subject = assignableData.subjects.find(s => s.id === parseInt(selectedSubjectId));
            if (!subject) return { entities: [], type: 'Unknown' };

            if (isLab) {
                if (subject.subjectType === 'Common') {
                    const permanentBatches = assignableData.divisions
                        .filter(d => d.divisionType === 'Permanent' && (!d.linkedSubjectType || d.linkedSubjectType === 'Common'))
                        .flatMap(d => (d.batches || []).map(b => ({ id: b.id, name: b.name, displayName: `${b.name} (${d.name})`, isCustom: false })))
                        .sort((a,b) => a.displayName.localeCompare(b.displayName));
                    return { entities: permanentBatches, type: 'Batch' };

                } else if (subject.subjectType === 'MajorMinor') {
                     const permanentMajorMinorBatches = assignableData.divisions
                        .filter(d => d.divisionType === 'Permanent' && d.linkedSubjectType === 'MajorMinor' && d.courseCategory === subject.courseCategory)
                        .flatMap(d => (d.batches || []).map(b => ({ id: b.id, name: b.name, displayName: `${b.name} (${d.name})`, isCustom: false })))
                        .sort((a,b) => a.displayName.localeCompare(b.displayName));
                    return { entities: permanentMajorMinorBatches, type: 'Batch' };

                } else { // DLO / ILOT
                    // FIX: Use .filter() to get ALL matching temporary divisions, not just the first one.
                    const applicableTempDivs = assignableData.divisions.filter(d =>
                        d.divisionType === 'Temporary' && d.linkedSubjectType === subject.subjectType && d.courseCategory === subject.courseCategory
                    );

                    if (applicableTempDivs.length > 0) {
                        // Check if ANY of these divisions have a custom lab set (assuming they all share it if defined for the context)
                        const customSet = applicableTempDivs[0]?.applicableCustomLabGroupSet;
                        if (customSet) {
                            const customLabBatches = (customSet.customLabBatches || [])
                                .map(clb => ({ id: clb.id, name: clb.name, displayName: `${clb.name} (Custom Group)`, isCustom: true }));
                            return { entities: customLabBatches, type: 'Custom Lab Group' };
                        } else {
                            // FIX: Aggregate batches from ALL found temporary divisions.
                            const allComposedBatches = applicableTempDivs.flatMap(div =>
                                (div.composedOfPermanentBatches || []).map(b => ({
                                    id: b.id,
                                    name: b.name,
                                    displayName: `${b.name} (${b.permanentDivision?.name || '?'})`,
                                    isCustom: false
                                }))
                            );
                            // Remove duplicates in case a batch is part of multiple groups for some reason
                            const uniqueBatches = Array.from(new Map(allComposedBatches.map(item => [item.id, item])).values());
                            return {
                                entities: uniqueBatches.sort((a, b) => a.displayName.localeCompare(b.displayName)),
                                type: 'Batch (from Temp Div)'
                            };
                        }
                    }
                    return { entities: [], type: 'Batch' };
                }
            }
            // Logic for Theory (unchanged)
            return { entities: [], type: 'Division' };
        }, [selectedSubjectId, assignableData, isLab]);

        const handleAddClick = () => {
            if (!selectedSubjectId || !selectedEntityId) return;
            const selectedEntity = availableEntities.entities.find(e => e.id.toString() === selectedEntityId);
            if (!selectedEntity) return;

            const assignment = {
                subjectId: parseInt(selectedSubjectId),
                isCustomGroup: selectedEntity.isCustom,
                batchId: !selectedEntity.isCustom ? parseInt(selectedEntityId) : null,
                customLabBatchId: selectedEntity.isCustom ? parseInt(selectedEntityId) : null,
            };

            if (typeof onAdd === 'function') onAdd(assignment);
            setSelectedSubjectId(''); setSelectedEntityId('');
        };

        return (
            <div className="flex items-end gap-2 p-2 border-t dark:border-gray-700 mt-4">
                <div className="flex-1"><label className={labelStyle}>Subject</label><select value={selectedSubjectId} onChange={(e) => {setSelectedSubjectId(e.target.value); setSelectedEntityId('');}} className={inputStyle}><option value="">Select Subject</option>{assignableData.subjects.filter(s => isLab ? s.practicalHours > 0 : s.theoryHours > 0).map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}</select></div>
                <div className="flex-1"><label className={labelStyle}>{availableEntities.type}</label><select value={selectedEntityId} onChange={(e) => setSelectedEntityId(e.target.value)} className={inputStyle} disabled={!selectedSubjectId || availableEntities.entities.length === 0}><option value="">Select {availableEntities.type}</option>{availableEntities.entities.map(e => <option key={e.id} value={e.id}>{e.displayName || e.name}</option>)}</select></div>
                <button type="button" onClick={handleAddClick} className={buttonPrimaryStyle} disabled={!selectedEntityId}>Add</button>
            </div>
        );
    };

    const renderTheoryTimingSection = (groupType) => {
        const relevantCGs = courseGroups[groupType] || [];
        const slotsForThisGroupType = settings.theoryTimings[groupType] || [];

        return (
            <div className="mb-4">
                <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-2">For '{groupType}' Course Groups:</h4>
                {relevantCGs.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">No specific '{groupType}' course groups found. Define subjects with these groups first.</p>}
                 {relevantCGs.map(cgName => (
                    <div key={`${groupType}-${cgName}-theory`} className="mb-3 pl-4 border-l-2 dark:border-gray-600">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Group: {cgName}</p>
                        {slotsForThisGroupType.filter(t => t.courseGroup === cgName).map((timing, idx) => {
                             const originalIndex = slotsForThisGroupType.findIndex(s => s === timing);
                            return (
                            <div key={`${groupType}-${cgName}-slot-${originalIndex}`} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 items-center gap-2 mb-2 p-2 border rounded dark:border-gray-500">
                                 <div className="md:col-span-1"><label className="text-xs block">Day</label><select value={timing.day || 'Monday'} onChange={(e) => handleTheoryTimingChange(groupType, originalIndex, 'day', e.target.value)} className={inputStyle}>{DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                                <div className="md:col-span-1"><label className="text-xs block">Start</label><select value={timing.startTime || '09:00'} onChange={(e) => handleTheoryTimingChange(groupType, originalIndex, 'startTime', e.target.value)} className={inputStyle}>{TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div className="md:col-span-1"><label className="text-xs block">End (1hr)</label><input type="text" value={getCalculatedEndTime(timing.startTime || '09:00', THEORY_DURATION_HOURS)} readOnly className={`${inputStyle} bg-gray-100 dark:bg-gray-700/50`} /></div>
                                <div className="md:col-span-1"><label className="text-xs block">Subject Hint</label><input type="text" placeholder="e.g. NLP, AI" value={timing.subjectNameHint || ''} onChange={(e) => handleTheoryTimingChange(groupType, originalIndex, 'subjectNameHint', e.target.value)} className={inputStyle} /></div>
                                <div className="self-end"><button type="button" onClick={() => removeTheoryTimingSlot(groupType, originalIndex)} className={`${buttonDangerStyle} w-full`}>Remove</button></div>
                            </div>
                         );})}
                        <button type="button" onClick={() => addTheoryTimingSlot(groupType, cgName)} className={`${buttonPrimaryStyle} text-xs bg-green-600 hover:bg-green-700 mt-1`}>+ Add Slot for {cgName}</button>
                    </div>
                ))}
            </div>
        );
    };

    const departmentNameForGrid = departments.find(d => d.id.toString() === settings.departmentId)?.name || "Selected Department";
    const yearLabel = YEARS.find(y => y.value.toString() === settings.year)?.label || settings.year;
    const semesterTypeLabel = SEMESTER_TYPES.find(st => st.value === settings.semesterType)?.label || settings.semesterType;
    const sessionLabel = ACADEMIC_SESSION_YEARS.find(s => s.value === settings.academicSessionStartYear)?.label || settings.academicSessionStartYear;
    const academicContextForGrid = `${yearLabel} ${semesterTypeLabel} Sem (${sessionLabel})`;

    let gridTitle = "Generated Timetable";
    let currentDisplayContextName = null; let currentViewIdentifier = null;

    if (viewMode === 'division' && selectedDivisionForDisplay) {
        currentDisplayContextName = divisionsForDisplay.find(d => d.id.toString() === selectedDivisionForDisplay)?.name;
        gridTitle = `Division: ${currentDisplayContextName || 'Select Division'}`;
        currentViewIdentifier = selectedDivisionForDisplay;
    } else if (viewMode === 'faculty' && selectedFacultyForDisplay) {
        currentDisplayContextName = facultyForDisplay.find(f => f.id.toString() === selectedFacultyForDisplay)?.name;
        gridTitle = `Faculty: ${currentDisplayContextName || 'Select Faculty'}`;
        currentViewIdentifier = selectedFacultyForDisplay;
    } else if (viewMode === 'room' && selectedRoomForDisplay) {
        currentDisplayContextName = roomsForDisplay.find(r => r.id.toString() === selectedRoomForDisplay)?.roomNumber;
        gridTitle = `Room: ${currentDisplayContextName || 'Select Room'}`;
        currentViewIdentifier = selectedRoomForDisplay;
    }

    const SpecificLabAssignModal = () => {
        if (!isLabAssignModalOpen || editingLabSlotIndex === null) return null;
        const slot = settings.labTimings.specificSlots[editingLabSlotIndex];
        return (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Assign Labs for {slot.dayOfWeek} at {slot.startTime}</h3>
                    <div className="flex-grow overflow-y-auto mb-4">
                        <p className="text-sm mb-2 text-gray-600 dark:text-gray-400">Current Assignments:</p>
                        {tempAssignments.length === 0 ? <p className="text-center text-gray-500 italic py-4">No labs assigned.</p> : (
                            <ul className="space-y-2">
                                {tempAssignments.map((ass, index) => {
                                    const subject = assignableData.subjects.find(s => s.id === ass.subjectId);
                                    let batch = null;
                                    if(ass.isCustomGroup) {
                                        batch = assignableData.divisions.flatMap(d => d.applicableCustomLabGroupSet?.customLabBatches || []).find(b => b.id === ass.customLabBatchId);
                                    } else {
                                        batch = assignableData.divisions.flatMap(d => d.batches || []).find(b => b.id === ass.batchId);
                                    }
                                    return (
                                        <li key={index} className="flex justify-between items-center p-2 bg-gray-100 dark:bg-gray-700 rounded">
                                            <span><span className="font-semibold">{subject?.name}</span> for <span className="font-semibold">{batch?.name} {ass.isCustomGroup ? '(Custom)' : ''}</span></span>
                                            <button onClick={() => removeTempAssignment(index)} className={`${buttonDangerStyle} !py-1 !px-2`}>Remove</button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                    <AssignmentAdder onAdd={addTempAssignment} isLab={true} />
                    <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
                        <button type="button" onClick={closeLabAssignModal} className={buttonSecondaryStyle}>Cancel</button>
                        <button type="button" onClick={saveAssignmentsToSettings} className={`${buttonPrimaryStyle} bg-green-600 hover:bg-green-700`}>Save Assignments</button>
                    </div>
                </div>
            </div>
        );
    };
    
    // NEW COMPONENT: Modal to display the unassigned tasks
    const UnassignedTasksModal = () => {
        if (!isUnassignedModalOpen) return null;

        return (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Unassigned Task Details ({unassignedTaskDetails.length})</h3>
                        <button onClick={() => setIsUnassignedModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white">&times;</button>
                    </div>
                    <div className="flex-grow overflow-y-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Subject</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Division/Batch</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Faculty</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Reason for Failure</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {unassignedTaskDetails.map((task, index) => (
                                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{task.subjectName} ({task.subjectCode})</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{task.divisionName} {task.batchName ? `(${task.batchName})` : ''}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{task.facultyName}</td>
                                        <td className="px-4 py-4 whitespace-normal text-sm text-red-600 dark:text-red-400 font-semibold">{task.reason}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex justify-end pt-4 mt-4 border-t dark:border-gray-600">
                        <button onClick={() => setIsUnassignedModalOpen(false)} className={buttonSecondaryStyle}>Close</button>
                    </div>
                </div>
            </div>
        );
    };


    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            {toast.show && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">Timetable Generation Settings</h1>

            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-300 p-4 mb-4 rounded relative" role="alert"><button onClick={() => setError('')} className="absolute top-0 right-0 mt-2 mr-3 font-bold text-lg">&times;</button><span className="block sm:inline whitespace-pre-wrap">{error}</span></div>}

            <section className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg shadow border dark:border-gray-700">
                <h2 className={sectionTitleStyle}>1. Basic Configuration</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div><label className={labelStyle}>Department*</label><select name="departmentId" value={settings.departmentId} onChange={handleSettingChange} className={inputStyle} disabled={!!globalSelectedDepartment}><option value="">Select Department</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                    <div><label className={labelStyle}>Year*</label><select name="year" value={settings.year} onChange={handleSettingChange} className={inputStyle}><option value="">Select Year</option>{YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}</select></div>
                    <div><label className={labelStyle}>Semester Type*</label><select name="semesterType" value={settings.semesterType} onChange={handleSettingChange} className={inputStyle}><option value="">Select Semester</option>{SEMESTER_TYPES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}</select></div>
                    <div><label className={labelStyle}>Academic Session*</label><select name="academicSessionStartYear" value={settings.academicSessionStartYear} onChange={handleSettingChange} className={inputStyle}>{ACADEMIC_SESSION_YEARS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
                </div>
            </section>

            <fieldset disabled={!basicConfigComplete} className="space-y-6">
                 <div className={`p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg shadow border dark:border-gray-700 transition-opacity duration-300 ${!basicConfigComplete ? 'opacity-50' : 'opacity-100'}`}>
                    <h2 className={sectionTitleStyle}>2. Timing Presets</h2>
                     <div className="space-y-4">
                        <div>
                            <label className={labelStyle}>Save/Update Preset</label>
                             <div className="flex items-center gap-2 mt-1">
                               <input type="text" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} placeholder="Enter preset name to save or update" className={inputStyle} />
                               <button onClick={handleSavePreset} className={buttonPrimaryStyle} disabled={!newPresetName.trim()}>
                                    {presets.some(p=>p.name.toLowerCase() === newPresetName.toLowerCase().trim()) ? 'Update' : 'Save New'}
                               </button>
                            </div>
                        </div>
                        <div className="pt-4 border-t dark:border-gray-700">
                            <label className={labelStyle}>Manage Existing Presets</label>
                            {isLoading ? <p>Loading...</p> : presets.length === 0 ? (
                                <div className="text-center py-4 px-3 bg-gray-100 dark:bg-gray-800 rounded-md mt-2"><p className="text-sm text-gray-500 dark:text-gray-400">No presets found for this context. Save one to reuse settings.</p></div>
                            ) : (
                                <div className="space-y-2 mt-2 max-h-48 overflow-y-auto pr-2">
                                    {presets.map(p => (
                                        <div key={p.id} className={`flex items-center justify-between p-2 rounded-md shadow-sm text-sm ${p.id === loadedPresetId ? 'bg-blue-100 dark:bg-blue-900/50 border border-blue-400' : 'bg-white dark:bg-gray-700/50'}`}>
                                            <span className="font-medium text-gray-800 dark:text-gray-200 flex items-center">{p.name} {p.id === loadedPresetId && <span className="ml-2 text-xs text-white bg-blue-500 px-2 py-0.5 rounded-full">In Use</span>}</span>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => handleLoadPreset(p.id)} className={`${buttonSecondaryStyle} !py-1 !px-3 text-xs`}>Load</button>
                                                <button onClick={() => handleDownloadPreset(p.id)} className={`${buttonSecondaryStyle} !py-1 !px-3 text-xs bg-green-100 dark:bg-green-800/50`}>Download</button>
                                                <button onClick={() => handleDeletePreset(p.id)} className={`${buttonDangerStyle} !py-1 !px-2 text-xs`}>Delete</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                     </div>
                </div>

                <div className={`p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg shadow border dark:border-gray-700 transition-opacity duration-300 ${!basicConfigComplete ? 'opacity-50' : 'opacity-100'}`}>
                      <h2 className={sectionTitleStyle}>3. College Timings, Days & Breaks</h2>
                     <div className="mb-4"><label className={labelStyle}>Working Days*</label><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{DAYS_OF_WEEK.map(day => (<label key={day} className="flex items-center space-x-2"><input type="checkbox" checked={settings.workingDays[day]} onChange={() => handleWorkingDayChange(day)} className="form-checkbox" /><span>{day}</span></label>))}</div></div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className={labelStyle}>College Start Time*</label><select name="collegeStartTime" value={settings.collegeStartTime} onChange={handleSettingChange} className={inputStyle}>{TIME_OPTIONS.map(time => <option key={time} value={time}>{time}</option>)}</select></div>
                        <div><label className={labelStyle}>College End Time*</label><select name="collegeEndTime" value={settings.collegeEndTime} onChange={handleSettingChange} className={inputStyle}>{TIME_OPTIONS.map(time => <option key={time} value={time}>{time}</option>)}</select></div>
                     </div>
                     <div className="mt-4 pt-4 border-t dark:border-gray-700">
                        {!settings.useAlternateBreaks && (
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div><label htmlFor="primaryBreakStartTime" className={labelStyle}>Primary Break Start (1hr)*</label><select name="primaryBreakStartTime" value={settings.primaryBreakStartTime} onChange={handleSettingChange} className={inputStyle}>{TIME_OPTIONS.map(time => <option key={time} value={time}>{time}</option>)}</select></div>
                                <div><label className={labelStyle}>Primary Break End (auto)</label><input type="text" value={getCalculatedEndTime(settings.primaryBreakStartTime, 1)} readOnly className={`${inputStyle} bg-gray-100 dark:bg-gray-700/50`} /></div>
                             </div>
                        )}
                        <div><label className="flex items-center space-x-2 text-sm cursor-pointer"><input type="checkbox" name="useAlternateBreaks" checked={settings.useAlternateBreaks} onChange={handleSettingChange} className="form-checkbox h-4 w-4"/><span>Use Alternate Break Timings?</span></label></div>
                        {settings.useAlternateBreaks && (
                             <div className="mt-4 space-y-4 pl-4 border-l-2 dark:border-gray-600">
                                <p className="text-xs text-gray-500 dark:text-gray-400">Define base alternate breaks and assign them to divisions.</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div><label htmlFor="alternateBreak1StartTime" className={labelStyle}>Alt. Break 1 Start (1hr)*</label><select name="alternateBreak1StartTime" value={settings.alternateBreak1StartTime} onChange={handleSettingChange} className={inputStyle}>{TIME_OPTIONS.map(time => <option key={time} value={time}>{time}</option>)}</select></div>
                                    <div><label htmlFor="alternateBreak2StartTime" className={labelStyle}>Alt. Break 2 Start (1hr)</label><select name="alternateBreak2StartTime" value={settings.alternateBreak2StartTime} onChange={handleSettingChange} className={inputStyle}><option value="">-- Optional --</option>{TIME_OPTIONS.map(time => <option key={time} value={time}>{time}</option>)}</select></div>
                                </div>
                                <h4 className="text-md font-medium text-gray-700 dark:text-gray-300 mt-3">Assign Breaks to Divisions:</h4>
                                <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                                    {allDivisionsForAltBreak.map((division) => (
                                    <div key={division.id} className="flex items-center gap-2 text-sm">
                                         <span className="w-1/3 truncate" title={division.name}>{division.name}:</span>
                                        <select value={settings.alternateBreakAssignments.find(a=>a.divisionId === division.id.toString())?.breakStartTime || ''} onChange={(e) => handleAlternateBreakAssignmentChange(division.id.toString(), e.target.value)} className={`${inputStyle} py-1 text-xs w-2/3`}>
                                            <option value="">-- Use Primary Break --</option>
                                            <option value={settings.alternateBreak1StartTime}>Alt Break 1 ({settings.alternateBreak1StartTime})</option>
                                            {settings.alternateBreak2StartTime && <option value={settings.alternateBreak2StartTime}>Alt Break 2 ({settings.alternateBreak2StartTime})</option>}
                                        </select>
                                    </div>
                                    ))}
                                </div>
                            </div>
                         )}
                     </div>
                </div>

                <div className={`p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg shadow border dark:border-gray-700 transition-opacity duration-300 ${!basicConfigComplete ? 'opacity-50' : 'opacity-100'}`}>
                     <h2 className={sectionTitleStyle}>4. Practical Lab Timings (2-hour slots)</h2>
                     <div className="flex items-center gap-6 mb-4">
                        <label className="flex items-center gap-2 text-sm"><input type="radio" name="labTimingType" value="General" checked={settings.labTimings.labTimingType === 'General'} onChange={() => handleLabTimingTypeChange('General')} className="form-radio" /> General Timings</label>
                        <label className="flex items-center gap-2 text-sm"><input type="radio" name="labTimingType" value="Specific" checked={settings.labTimings.labTimingType === 'Specific'} onChange={() => handleLabTimingTypeChange('Specific')} className="form-radio" /> Specific Assignments</label>
                     </div>

                     {settings.labTimings.labTimingType === 'General' && (
                        <div className="p-4 border-t dark:border-gray-700 space-y-4">
                            <p className="text-sm text-gray-600 dark:text-gray-400">Define general slots. The algorithm will schedule required labs into these slots.</p>
                            <div>
                                <label className={labelStyle}>Number of Lab Slots per Week</label>
                                <input type="number" min="0" max="20" value={settings.labTimings.generalSlotsCount} onChange={handleGeneralSlotsCountChange} className={inputStyle} />
                            </div>
                            {settings.labTimings.generalSlots.map((slot, index) => (
                                <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-2 border rounded items-end">
                                    <div><label className={labelStyle}>Day</label><select value={slot.dayOfWeek} onChange={(e) => handleGeneralSlotDetailChange(index, 'dayOfWeek', e.target.value)} className={inputStyle}>{DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                                    <div><label className={labelStyle}>Start Time</label><select value={slot.startTime} onChange={(e) => handleGeneralSlotDetailChange(index, 'startTime', e.target.value)} className={inputStyle}>{TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                    <div><label className={labelStyle}>End Time</label><input type="text" value={slot.endTime} readOnly className={`${inputStyle} bg-gray-100 dark:bg-gray-700/50`} /></div>
                                </div>
                            ))}
                        </div>
                     )}

                     {settings.labTimings.labTimingType === 'Specific' && (
                         <div className="p-4 border-t dark:border-gray-700 space-y-4">
                             <p className="text-sm text-gray-600 dark:text-gray-400">Define specific slots and manually assign labs to batches.</p>
                             {settings.labTimings.specificSlots.map((slot, index) => (
                                <div key={index} className="p-3 border rounded dark:border-gray-600 space-y-2">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                         <div><label className={labelStyle}>Day</label><select value={slot.dayOfWeek} onChange={(e) => handleSpecificLabSlotDetailChange(index, 'dayOfWeek', e.target.value)} className={inputStyle}>{DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                                        <div><label className={labelStyle}>Start Time</label><select value={slot.startTime} onChange={(e) => handleSpecificLabSlotDetailChange(index, 'startTime', e.target.value)} className={inputStyle}>{TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                        <div><label className={labelStyle}>End Time</label><input type="text" value={slot.endTime} readOnly className={`${inputStyle} bg-gray-100`} /></div>
                                        <div className="flex gap-2">
                                          <button onClick={() => openLabAssignModal(index)} className={`${buttonPrimaryStyle} w-full`}>Assign ({slot.assignments.length})</button>
                                          <button onClick={() => removeSpecificLabSlot(index)} className={`${buttonDangerStyle} !p-2`}>✕</button>
                                        </div>
                                    </div>
                                </div>
                             ))}
                             <button onClick={addSpecificLabSlot} className={`${buttonSecondaryStyle} mt-2`}>+ Add Specific Lab Slot</button>
                         </div>
                     )}
                </div>

                <div className={`p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg shadow border dark:border-gray-700 transition-opacity duration-300 ${!basicConfigComplete ? 'opacity-50' : 'opacity-100'}`}>
                    <div className="flex justify-between items-center mb-2">
                         <h2 className={sectionTitleStyle}>5. Specific Theory Timings (Optional)</h2>
                         <label className="flex items-center space-x-2 text-sm">
                            <input type="checkbox" name="isSpecific" checked={settings.theoryTimings.isSpecific} onChange={(e) => handleSettingsUpdate(s => ({...s, theoryTimings: {...s.theoryTimings, isSpecific: e.target.checked}}))} className="form-checkbox"/>
                            <span>Define Fixed Theory Slots?</span>
                         </label>
                    </div>
                     {settings.theoryTimings.isSpecific && ( <>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Define specific day/time slots for DLO, ILOT, or MajorMinor theory lectures. Common subject lectures are scheduled freely by the GA.</p>
                        {(isLoading && (!courseGroups.DLO?.length && !courseGroups.MajorMinor?.length && !courseGroups.ILOT?.length)) && <p className="text-sm text-gray-500">Loading course groups for theory settings...</p>}
                        {renderTheoryTimingSection('DLO')}
                        {renderTheoryTimingSection('ILOT')}
                        {renderTheoryTimingSection('MajorMinor')}
                    </>)}
                </div>

                <div className={`p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg shadow border dark:border-gray-700 transition-opacity duration-300 ${!basicConfigComplete ? 'opacity-50' : 'opacity-100'}`}>
                     <div className="flex items-center justify-between mb-2">
                         <h2 className={sectionTitleStyle}>6. Floor Preferences (Optional)</h2>
                         <label className="flex items-center space-x-2 text-sm"><input type="checkbox" name="enableFloorPreferences" checked={settings.enableFloorPreferences} onChange={handleSettingChange} className="form-checkbox"/><span>Set Floor Preferences?</span></label>
                    </div>
                    {settings.enableFloorPreferences && (
                        <div className="pt-2 border-t dark:border-gray-600">
                            <h3 className="text-md font-medium text-gray-700 dark:text-gray-300 mt-2">Floor Preferences</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
                                {Object.keys(settings.floorPreferences).map(groupType => (
                                    <div key={`floor-${groupType}`}>
                                        <label className={labelStyle}>Floors for {groupType}</label>
                                        <input type="text" value={settings.floorPreferences[groupType]} onChange={(e) => handleFloorPreferenceChange(groupType, e.target.value)} placeholder="e.g., 3,4" className={inputStyle}/>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </fieldset>

            <div className="mt-8 flex justify-center items-center gap-4">
                <button onClick={handleGenerateTimetable} className={`${buttonPrimaryStyle} text-lg py-3 px-8 bg-green-600 hover:bg-green-700`} disabled={isLoading || !basicConfigComplete || userInfo?.role !== 'Admin'}>
                    {isLoading ? 'Processing...' : 'Generate Timetable'}
                </button>
                
                {/* NEW BUTTON: To open the unassigned tasks modal */}
                {unassignedTaskDetails.length > 0 && (
                    <button onClick={() => setIsUnassignedModalOpen(true)} className={`${buttonDangerStyle} text-lg py-3 px-8`}>
                        View Unassigned ({unassignedTaskDetails.length})
                    </button>
                )}
            </div>

            <SpecificLabAssignModal />
            <UnassignedTasksModal />

            {showTimetableDisplay && generatedTimetable && (
                 <section className="mt-10 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700" >
                     <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3 flex-wrap">
                        <h2 className="text-2xl font-semibold truncate" title={gridTitle}>{gridTitle}</h2>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                             <select value={viewMode} onChange={(e) => { setViewMode(e.target.value); setShowPrintPreview(false); }} className={`${inputStyle}`}>
                                <option value="division">View by Division</option>
                                <option value="faculty">View by Faculty</option>
                                <option value="room">View by Room</option>
                            </select>
                            {viewMode === 'division' && <select value={selectedDivisionForDisplay} onChange={e=>setSelectedDivisionForDisplay(e.target.value)} className={inputStyle}><option value="">Select Division</option>{divisionsForDisplay.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>}
                            {viewMode === 'faculty' && <select value={selectedFacultyForDisplay} onChange={e=>setSelectedFacultyForDisplay(e.target.value)} className={inputStyle}><option value="">Select Faculty</option>{facultyForDisplay.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>}
                            {viewMode === 'room' && <select value={selectedRoomForDisplay} onChange={e=>setSelectedRoomForDisplay(e.target.value)} className={inputStyle}><option value="">Select Room</option>{roomsForDisplay.map(r=><option key={r.id} value={r.id}>{r.roomNumber}</option>)}</select>}
                             <button onClick={handleInitiatePrint} className={`${buttonPrimaryStyle} bg-purple-600 hover:bg-purple-700`} disabled={!currentViewIdentifier || showPrintPreview}>Print</button>
                        </div>
                    </div>

                    {!showPrintPreview && currentViewIdentifier && timetableToDisplay.length > 0 ? (
                        <TimetableGrid ref={timetableGridRef} timetableData={timetableToDisplay} settings={settings} onSlotClick={handleSlotClick} onSlotDrop={handleSlotDrop} isAdmin={userInfo?.role === 'Admin'} />
                    ) : !showPrintPreview ? (
                         <p className="text-center text-gray-500 py-5">Select an item to view its timetable.</p>
                    ) : null}

                    {showPrintPreview && <div className="fixed inset-0 bg-gray-900 bg-opacity-80 flex items-center justify-center z-50 p-4"><div className="bg-white p-6 rounded-lg w-full max-w-6xl max-h-[95vh] overflow-y-auto"><div ref={timetableGridRef}><TimetableGrid timetableData={timetableToDisplay} settings={settings} isPrintPreview={true} departmentName={departmentNameForGrid} academicContext={academicContextForGrid} viewContextName={currentDisplayContextName} /></div><div className="mt-6 flex justify-end gap-3"><button onClick={()=>setShowPrintPreview(false)} className={buttonSecondaryStyle}>Close</button><button onClick={handleActualPdfSave} className={buttonPrimaryStyle}>Save PDF</button></div></div></div>}

                    {!showPrintPreview && userInfo?.role === 'Admin' && (
                        <div className="mt-6 flex justify-end">
                             <button onClick={handleSaveReviewedTimetable} className={`${buttonPrimaryStyle} bg-teal-600 hover:bg-teal-700`} disabled={isLoading}>Save Timetable</button>
                        </div>
                    )}
                </section>
            )}

             {showSlotDetailModal && selectedSlotDetails && (
                 <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-semibold">{isEditingSlot ? "Edit Slot" : "Slot Details"}</h3><button onClick={handleCloseSlotDetailModal} className="text-gray-400 hover:text-gray-600">&times;</button></div>
                        {!isEditingSlot ? (
                            <div className="space-y-2 text-sm">
                                <p><strong>Day:</strong> {selectedSlotDetails.dayOfWeek}</p>
                                <p><strong>Time:</strong> {selectedSlotDetails.startTime} - {selectedSlotDetails.endTime}</p>
                                 {selectedSlotDetails.isCourseGroup ? (
                                    <>
                                        <p><strong>Course Group:</strong> {selectedSlotDetails.originalTask.courseGroup}</p>
                                        <p><strong>Details:</strong></p>
                                        <ul className="list-disc pl-5 mt-2 space-y-1">{selectedSlotDetails.tasks.map(t=><li key={t.key}>{t.subjectName} by {t.facultyName} in {t.roomNumber}</li>)}</ul>
                                    </>
                                 ) : selectedSlotDetails.isLabGroup ? (
                                    <>
                                        <p><strong>Session:</strong> {selectedSlotDetails.subjectName}</p>
                                        <p><strong>Labs in this slot:</strong></p>
                                        <ul className="list-disc pl-5 mt-2 space-y-1">{selectedSlotDetails.tasks.map(t=><li key={t.key}>{t.subjectName} ({t.batchName}) by {t.facultyName} in {t.roomNumber}</li>)}</ul>
                                    </>
                                 ) : selectedSlotDetails.isEmpty ? <p>This is an empty slot.</p> : (
                                    <>
                                        <p><strong>Subject:</strong> {selectedSlotDetails.subjectName} ({selectedSlotDetails.subjectCode})</p>
                                        <p><strong>Faculty:</strong> {selectedSlotDetails.facultyName}</p>
                                        <p><strong>Room:</strong> {selectedSlotDetails.roomNumber}</p>
                                        <p><strong>For:</strong> {selectedSlotDetails.divisionName}{selectedSlotDetails.batchName ? ` / ${selectedSlotDetails.batchName}`:''}</p>
                                    </>
                                )}
                                 <div className="mt-6 flex justify-end gap-2">{selectedSlotDetails.isEditable && <button onClick={()=>handleOpenEditModal(selectedSlotDetails)} className={buttonPrimaryStyle}>Edit</button>}<button onClick={handleCloseSlotDetailModal} className={buttonSecondaryStyle}>Close</button></div>
                            </div>
                        ) : (
                            <form onSubmit={(e)=>{e.preventDefault(); handleSaveChangesToSlot();}} className="space-y-4">
                                 <div><label className={labelStyle}>Day</label><select name="day" value={editSlotFormData.day} onChange={handleEditSlotFormChange} className={inputStyle}>{DAYS_OF_WEEK.map(d=><option key={d} value={d}>{d}</option>)}</select></div>
                                <div><label className={labelStyle}>Start Time</label><select name="startTime" value={editSlotFormData.startTime} onChange={handleEditSlotFormChange} className={inputStyle}>{TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                                 <div><label className={labelStyle}>Room</label><select name="roomId" value={editSlotFormData.roomId} onChange={handleEditSlotFormChange} className={inputStyle}>{roomsForDisplay.map(r=><option key={r.id} value={r.id}>{r.roomNumber}</option>)}</select></div>
                                <div><label className={labelStyle}>Faculty</label><select name="facultyId" value={editSlotFormData.facultyId} onChange={handleEditSlotFormChange} className={inputStyle}>{facultyForDisplay.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
                                <div className="flex justify-end gap-3 pt-3"><button type="button" onClick={handleCloseSlotDetailModal} className={buttonSecondaryStyle}>Cancel</button><button type="submit" className={buttonPrimaryStyle}>Save</button></div>
                             </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default TimetableManagementPage;