// File: client/src/pages/ViewTimetablePage.jsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../App';
import { useDepartment } from '../context/DepartmentContext';
import TimetableGrid from '../components/TimetableGrid';
import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas';

const API_BASE_URL = 'http://localhost:5001/api';

const YEARS = [
    { value: 1, label: 'FE (First Year)' }, { value: 2, label: 'SE (Second Year)' },
    { value: 3, label: 'TE (Third Year)' }, { value: 4, label: 'BE (Fourth Year)' },
];
const SEMESTER_TYPES = [{ value: 'odd', label: 'Odd' }, { value: 'even', label: 'Even' }];
const ACADEMIC_SESSION_YEARS = Array.from({ length: 10 }, (_, i) => {
    const year = new Date().getFullYear() - 5 + i;
    return { value: year.toString(), label: `${year}-${(year + 1).toString().slice(-2)}` };
});

function ViewTimetablePage() {
    const { userInfo } = useAuth();
    const { departments, isLoadingDepartments, selectedDepartment: globalSelectedDepartment } = useDepartment();

    const [filters, setFilters] = useState({
        departmentId: '',
        year: '',
        semesterType: '',
        academicSessionStartYear: new Date().getFullYear().toString(),
    });
    const [viewMode, setViewMode] = useState('division'); // division, faculty, room
    const [selectedViewId, setSelectedViewId] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const [timetableData, setTimetableData] = useState([]);
    const [displayData, setDisplayData] = useState({ divisions: [], faculty: [], rooms: [] });

    const timetableGridRef = useRef(null);
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    
    const isAdmin = useMemo(() => userInfo?.role === 'Admin', [userInfo]);

    useEffect(() => {
        setFilters(prev => ({ ...prev, departmentId: globalSelectedDepartment?.id || '' }));
    }, [globalSelectedDepartment]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
        setTimetableData([]);
        setDisplayData({ divisions: [], faculty: [], rooms: [] });
        setSelectedViewId('');
        setError('');
    };

    const handleFetchTimetable = useCallback(async () => {
        if (!filters.departmentId || !filters.year || !filters.semesterType || !filters.academicSessionStartYear) {
            setError("Please select Department, Year, Semester Type, and Academic Session.");
            return;
        }
        setIsLoading(true);
        setError('');
        const token = localStorage.getItem('authToken');
        try {
            const response = await axios.get(`${API_BASE_URL}/view-timetable`, {
                params: filters,
                headers: { Authorization: `Bearer ${token}` }
            });
            const { timetable, displayData: fetchedDisplayData } = response.data;
            setTimetableData(timetable || []);
            setDisplayData(fetchedDisplayData || { divisions: [], faculty: [], rooms: [] });

            // Set default view after fetching
            if (viewMode === 'division' && fetchedDisplayData.divisions.length > 0) {
                setSelectedViewId(fetchedDisplayData.divisions[0].id.toString());
            } else {
                setSelectedViewId('');
            }

        } catch (err) {
            setError(err.response?.data?.message || "Failed to fetch timetable data.");
            setTimetableData([]);
            setDisplayData({ divisions: [], faculty: [], rooms: [] });
        } finally {
            setIsLoading(false);
        }
    }, [filters, viewMode]);

    const filteredTimetable = useMemo(() => {
        if (!selectedViewId) return [];
        if (viewMode === 'division') {
            const divId = parseInt(selectedViewId);
            return timetableData.filter(slot => slot.originalTask?.divisionId === divId || slot.slotCategory === 'Event_Scheduled');
        }
        if (viewMode === 'faculty') {
            const facId = parseInt(selectedViewId);
            return timetableData.filter(slot => slot.originalTask?.facultyId === facId || slot.slotCategory === 'Event_Scheduled');
        }
        if (viewMode === 'room') {
            const roomId = parseInt(selectedViewId);
            return timetableData.filter(slot => slot.roomId === roomId || (slot.slotCategory === 'Event_Scheduled' && slot.originalTask?.allRoomIds?.includes(roomId)));
        }
        return [];
    }, [selectedViewId, viewMode, timetableData]);
    
    const handleInitiatePrint = () => {
        if (!selectedViewId || filteredTimetable.length === 0) {
            alert("Please select an item with a timetable to preview.");
            return;
        }
        setShowPrintPreview(true);
    };

    const handleActualPdfSave = () => {
        const input = timetableGridRef.current;
        if (!input) {
            alert("Preview component is not available.");
            setShowPrintPreview(false);
            return;
        }

        html2canvas(input, { scale: 2, useCORS: true })
            .then((canvas) => {
                const imgData = canvas.toDataURL('image/png');
                const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                const canvasWidth = canvas.width;
                const canvasHeight = canvas.height;
                const ratio = canvasWidth / canvasHeight;
                const imgWidth = pdfWidth - 20; // with margin
                const imgHeight = imgWidth / ratio;
                pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
                pdf.save(`Timetable_${viewMode}_${selectedViewId}.pdf`);
                setShowPrintPreview(false);
            });
    };

    const currentViewOptions = useMemo(() => {
        if (viewMode === 'division') return displayData.divisions;
        if (viewMode === 'faculty') return displayData.faculty;
        if (viewMode === 'room') return displayData.rooms;
        return [];
    }, [viewMode, displayData]);

    const currentDisplayContext = useMemo(() => {
        if (!selectedViewId) return null;
        const option = currentViewOptions.find(o => o.id.toString() === selectedViewId);
        return option ? (option.name || option.roomNumber) : null;
    }, [selectedViewId, currentViewOptions]);
    
    const settingsForGrid = {
        workingDays: { Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: false },
        collegeStartTime: '09:00',
        collegeEndTime: '17:00',
        primaryBreakStartTime: '12:00',
    };
    
    const academicContextForGrid = `${YEARS.find(y => y.value.toString() === filters.year)?.label || ''} - ${SEMESTER_TYPES.find(s => s.value === filters.semesterType)?.label || ''} Semester (${filters.academicSessionStartYear}-${(parseInt(filters.academicSessionStartYear)+1).toString().slice(-2)})`;

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">View Timetable</h1>

            <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg shadow border dark:border-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Filter fields */}
                    <select name="departmentId" value={filters.departmentId} onChange={handleFilterChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" disabled={isLoadingDepartments || !!globalSelectedDepartment}><option value="">Select Department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
                    <select name="year" value={filters.year} onChange={handleFilterChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"><option value="">Select Year</option>{YEARS.map(y=><option key={y.value} value={y.value}>{y.label}</option>)}</select>
                    <select name="semesterType" value={filters.semesterType} onChange={handleFilterChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"><option value="">Select Semester Type</option>{SEMESTER_TYPES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select>
                    <select name="academicSessionStartYear" value={filters.academicSessionStartYear} onChange={handleFilterChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"><option value="">Select Academic Session</option>{ACADEMIC_SESSION_YEARS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select>
                </div>
                 <div className="mt-4 flex justify-end">
                    <button onClick={handleFetchTimetable} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-50" disabled={isLoading}>Fetch Timetable</button>
                </div>
            </div>

            {error && <p className="text-red-500 text-center">{error}</p>}
            
            {timetableData.length > 0 && (
                 <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700">
                    <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3 flex-wrap">
                        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
                             <select value={viewMode} onChange={(e) => { setViewMode(e.target.value); setSelectedViewId(''); }} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">
                                <option value="division">View by Division</option>
                                <option value="faculty">View by Faculty</option>
                                <option value="room">View by Room</option>
                            </select>
                            <select value={selectedViewId} onChange={(e) => setSelectedViewId(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" disabled={currentViewOptions.length === 0}>
                                <option value="">-- Select {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)} --</option>
                                {currentViewOptions.map(option => (
                                    <option key={option.id} value={option.id}>{option.name || option.roomNumber} {option.uniqueId ? `(${option.uniqueId})` : ''}</option>
                                ))}
                            </select>
                        </div>
                        <button onClick={handleInitiatePrint} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm font-medium shadow-sm" disabled={!selectedViewId || filteredTimetable.length === 0}>Preview & Print</button>
                    </div>

                    {selectedViewId && <TimetableGrid ref={timetableGridRef} timetableData={filteredTimetable} settings={settingsForGrid} divisionName={currentDisplayContext} viewMode={viewMode} departmentName={departments.find(d=>d.id.toString() === filters.departmentId)?.name} academicContext={academicContextForGrid} isAdmin={isAdmin} />}
                </div>
            )}
            
            {showPrintPreview && (
                <div className="fixed inset-0 bg-gray-900 bg-opacity-80 flex items-center justify-center z-50 p-4 print:p-0">
                    <div className="bg-white p-6 rounded-lg shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto print:max-h-none print:overflow-visible print:shadow-none">
                        <div className="print:hidden flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold">Print Preview</h3>
                             <div className="flex gap-2">
                                <button onClick={() => setShowPrintPreview(false)} className="px-4 py-2 bg-gray-300 text-black rounded-md">Close</button>
                                <button onClick={handleActualPdfSave} className="px-4 py-2 bg-green-600 text-white rounded-md">Save as PDF</button>
                            </div>
                        </div>
                        <div ref={timetableGridRef}>
                            <TimetableGrid timetableData={filteredTimetable} settings={settingsForGrid} divisionName={currentDisplayContext} viewMode={viewMode} departmentName={departments.find(d=>d.id.toString() === filters.departmentId)?.name} academicContext={academicContextForGrid} isPrintPreview={true} isAdmin={isAdmin} />
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

export default ViewTimetablePage;
