// File: client/src/pages/EventSchedulingPage.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../App';
import { useDepartment } from '../context/DepartmentContext';

const API_BASE_URL = 'http://localhost:5001/api';
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EVENT_FREQUENCIES = [{ value: 'ONCE', label: 'One-Time Event' }, { value: 'WEEKLY', label: 'Weekly Recurring' }];

// Helper to generate time options
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
const TIME_OPTIONS = generateTimeOptions();

// Helper to convert HH:MM to minutes from midnight
const timeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

// Helper to format a UTC ISO date string for a datetime-local input
// Ensures the displayed time is the user's local equivalent of the stored UTC time.
const formatDateTimeForInput = (isoDateString) => {
    if (!isoDateString) return '';
    try {
        const date = new Date(isoDateString); // Parses the UTC ISO string.
                                          // Date object methods (getFullYear, getMonth, etc.) 
                                          // will return components in the browser's local timezone.
        if (isNaN(date.getTime())) {
            console.warn("formatDateTimeForInput: Received invalid date string:", isoDateString);
            return '';
        }
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0'); // getMonth() is 0-indexed
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (e) {
        console.error("Error formatting date for input:", isoDateString, e);
        return '';
    }
};


function EventSchedulingPage() {
    const { userInfo } = useAuth();
    const { departments, selectedDepartment: globalSelectedDepartment, isLoadingDepartments } = useDepartment();

    const [events, setEvents] = useState([]);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [showEventForm, setShowEventForm] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [currentEventId, setCurrentEventId] = useState(null);

    const initialEventTiming = { dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:00', specificDate: '' };
    const [eventFormData, setEventFormData] = useState({
        title: '',
        description: '',
        frequency: 'ONCE',
        departmentId: '',
        assignedRoomIds: [], 
        eventTimings: [initialEventTiming],
    });
    const [formError, setFormError] = useState('');
    const [isSubmittingForm, setIsSubmittingForm] = useState(false);

    const [clashCheckResult, setClashCheckResult] = useState(null);
    const [isCheckingClashes, setIsCheckingClashes] = useState(false);

    const [rooms, setRooms] = useState([]);

    const [showReminderModal, setShowReminderModal] = useState(false);
    const [reminderEventTarget, setReminderEventTarget] = useState(null); 
    const [reminderEnabledState, setReminderEnabledState] = useState(false);
    const [reminderDateTimeState, setReminderDateTimeState] = useState('');
    const [isSavingReminder, setIsSavingReminder] = useState(false);
    const [reminderError, setReminderError] = useState('');
    
    const isAdmin = useMemo(() => userInfo?.role === 'Admin', [userInfo]);

    const fetchRoomsForSelection = useCallback(async () => {
        if (!userInfo) return;
        const token = localStorage.getItem('authToken');
        try {
            const response = await axios.get(`${API_BASE_URL}/rooms`, { 
                headers: { Authorization: `Bearer ${token}` },
            });
            setRooms(response.data || []);
        } catch (err) {
            console.error("Error fetching rooms for event assignment:", err);
            setError("Could not load available rooms.");
        }
    }, [userInfo]);

    useEffect(() => {
        fetchRoomsForSelection();
    }, [fetchRoomsForSelection]);

    const fetchEvents = useCallback(async () => {
        setIsLoadingEvents(true);
        setError(''); 
        const token = localStorage.getItem('authToken');
        try {
            const params = {};
            if (globalSelectedDepartment) {
                params.departmentId = globalSelectedDepartment.id;
            }
            const response = await axios.get(`${API_BASE_URL}/events`, {
                params,
                headers: { Authorization: `Bearer ${token}` },
            });
            setEvents(response.data || []);
        } catch (err) {
            console.error("Fetch Events Error:", err);
            setError(err.response?.data?.message || 'Failed to fetch events.');
        } finally {
            setIsLoadingEvents(false);
        }
    }, [globalSelectedDepartment]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    useEffect(() => {
        if (showEventForm && !isEditMode && globalSelectedDepartment) {
            setEventFormData(prev => ({ ...prev, departmentId: globalSelectedDepartment.id.toString() }));
        }
    }, [showEventForm, isEditMode, globalSelectedDepartment]);

    const handleFormInputChange = (e) => {
        const { name, value } = e.target;
        setEventFormData(prev => ({ ...prev, [name]: value }));
        if (name === 'frequency' && value === 'WEEKLY') {
            setEventFormData(prev => ({
                ...prev,
                eventTimings: prev.eventTimings.map(t => ({ ...t, specificDate: '' }))
            }));
        }
    };

    const handleRoomSelectionChange = (roomId) => {
        const selectedRoomId = parseInt(roomId);
        setEventFormData(prev => {
            const currentAssignedRoomIds = prev.assignedRoomIds || [];
            const newAssignedRoomIds = currentAssignedRoomIds.includes(selectedRoomId)
                ? currentAssignedRoomIds.filter(id => id !== selectedRoomId)
                : [...currentAssignedRoomIds, selectedRoomId];
            return { ...prev, assignedRoomIds: newAssignedRoomIds };
        });
    };

    const handleTimingChange = (index, field, value) => {
        const updatedTimings = [...eventFormData.eventTimings];
        updatedTimings[index] = { ...updatedTimings[index], [field]: value };
        setEventFormData(prev => ({ ...prev, eventTimings: updatedTimings }));
    };

    const addTimingSlot = () => {
        setEventFormData(prev => ({
            ...prev,
            eventTimings: [...prev.eventTimings, { ...initialEventTiming, specificDate: prev.frequency === 'ONCE' ? '' : undefined }]
        }));
    };

    const removeTimingSlot = (index) => {
        if (eventFormData.eventTimings.length <= 1) {
            setFormError("At least one timing slot is required for an event.");
            return;
        }
        setFormError(''); 
        setEventFormData(prev => ({
            ...prev,
            eventTimings: prev.eventTimings.filter((_, i) => i !== index)
        }));
    };

    const resetForm = () => {
        setShowEventForm(false);
        setIsEditMode(false);
        setCurrentEventId(null);
        setEventFormData({
            title: '', description: '', frequency: 'ONCE', departmentId: globalSelectedDepartment?.id.toString() || '',
            assignedRoomIds: [], 
            eventTimings: [{ ...initialEventTiming, specificDate: '' }],
        });
        setFormError('');
        setClashCheckResult(null);
        setSuccessMessage(''); 
    };

    const handleShowAddForm = () => {
        if (!isAdmin) return; 
        resetForm();
        setShowEventForm(true);
    };

    const handleShowEditForm = (event) => {
        if (!isAdmin) return; 
        resetForm();
        setIsEditMode(true);
        setCurrentEventId(event.id);
        setEventFormData({
            title: event.title,
            description: event.description || '',
            frequency: event.frequency,
            departmentId: event.departmentId?.toString() || '',
            assignedRoomIds: event.assignedRooms ? event.assignedRooms.map(r => r.id) : [], 
            eventTimings: event.eventTimings.map(et => ({
                id: et.id, 
                dayOfWeek: et.dayOfWeek,
                startTime: et.startTime,
                endTime: et.endTime,
                specificDate: et.specificDate ? et.specificDate.split('T')[0] : '',
            })),
        });
        setShowEventForm(true);
    };

    const handleCheckClashes = async () => {
        setIsCheckingClashes(true);
        setFormError(''); 
        setClashCheckResult(null); 
        setSuccessMessage(''); 
        const token = localStorage.getItem('authToken');

        const payload = {
            eventTimings: eventFormData.eventTimings.map(et => ({
                ...et,
                frequency: eventFormData.frequency,
                specificDate: eventFormData.frequency === 'ONCE' ? et.specificDate : null
            })),
            assignedRoomIds: eventFormData.assignedRoomIds.map(id => parseInt(id)), 
        };

        try {
            const response = await axios.post(`${API_BASE_URL}/events/check-clashes`, payload, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setClashCheckResult(response.data);
            if (response.data.clashes && response.data.clashes.length > 0) {
                setFormError("Potential clashes detected! Review below. You can still save the event if room assignment is flexible or if clashes are acceptable/to be resolved manually.");
            } else {
                setSuccessMessage(response.data.message || "No direct clashes found with existing timetable for the specified room(s).");
            }
        } catch (err) {
            console.error("Clash Check Error:", err);
            setFormError(err.response?.data?.message || "Failed to check for clashes.");
        } finally {
            setIsCheckingClashes(false);
        }
    };

    const handleSubmitEventForm = async (e) => {
        e.preventDefault();
        if (!isAdmin) {
            setFormError("Only Admins can schedule or update events.");
            return;
        }
        setFormError('');
        setSuccessMessage('');
        const token = localStorage.getItem('authToken');

        if (!eventFormData.title.trim()) {
            setFormError("Event title is required."); return;
        }
        if (eventFormData.eventTimings.some(et => timeToMinutes(et.startTime) >= timeToMinutes(et.endTime))) {
            setFormError("Event end time must be after start time for all timing slots."); return;
        }
        if (eventFormData.frequency === 'ONCE' && eventFormData.eventTimings.some(et => !et.specificDate)) {
            setFormError("Specific date is required for all timing slots of a One-Time event."); return;
        }

        setIsSubmittingForm(true);
        const payload = {
            title: eventFormData.title,
            description: eventFormData.description,
            frequency: eventFormData.frequency,
            departmentId: eventFormData.departmentId ? parseInt(eventFormData.departmentId) : null,
            assignedRoomIds: eventFormData.assignedRoomIds.map(id => parseInt(id)), 
            eventTimings: eventFormData.eventTimings.map(et => ({
                id: et.id, 
                dayOfWeek: et.dayOfWeek,
                startTime: et.startTime,
                endTime: et.endTime,
                specificDate: eventFormData.frequency === 'ONCE' && et.specificDate ? et.specificDate : null,
            })),
        };

        const url = isEditMode ? `${API_BASE_URL}/events/${currentEventId}` : `${API_BASE_URL}/events`;
        const method = isEditMode ? 'put' : 'post';

        try {
            await axios[method](url, payload, { headers: { Authorization: `Bearer ${token}` } });
            setSuccessMessage(`Event ${isEditMode ? 'updated' : 'created'} successfully!`);
            resetForm();
            fetchEvents();
        } catch (err) {
            console.error("Submit Event Error:", err);
            setFormError(err.response?.data?.message || `Failed to ${isEditMode ? 'update' : 'create'} event.`);
        } finally {
            setIsSubmittingForm(false);
        }
    };

    const handleDeleteEvent = async (eventId, eventTitle) => {
        if (!isAdmin) {
             setError("Only Admins can delete events.");
             return;
        }
        if (!window.confirm(`Are you sure you want to delete the event "${eventTitle}"?`)) return;
        setError(''); setSuccessMessage('');
        const token = localStorage.getItem('authToken');
        try {
            await axios.delete(`${API_BASE_URL}/events/${eventId}`, { headers: { Authorization: `Bearer ${token}` } });
            setSuccessMessage(`Event "${eventTitle}" deleted successfully.`);
            fetchEvents();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to delete event.');
        }
    };

    const handleShowReminderModal = (event) => {
        if (!isAdmin) return; 
        setReminderEventTarget(event);
        setReminderEnabledState(event.reminderEnabled || false);
        // Use the corrected formatDateTimeForInput for displaying
        setReminderDateTimeState(event.reminderDateTime ? formatDateTimeForInput(event.reminderDateTime) : '');
        setReminderError('');
        setShowReminderModal(true);
    };

    const handleSaveReminder = async () => {
        if (!reminderEventTarget || !isAdmin) return;
        setIsSavingReminder(true);
        setReminderError('');
        const token = localStorage.getItem('authToken');

        if (reminderEnabledState && !reminderDateTimeState) {
            setReminderError("Please set a date and time for the reminder if it's enabled.");
            setIsSavingReminder(false);
            return;
        }

        try {
            // When saving, convert the local datetime string from the input to a UTC ISO string
            const reminderDateTimeISO = reminderEnabledState && reminderDateTimeState 
                                      ? new Date(reminderDateTimeState).toISOString() 
                                      : null;

            await axios.put(`${API_BASE_URL}/events/${reminderEventTarget.id}/reminder`, {
                reminderEnabled: reminderEnabledState,
                reminderDateTime: reminderDateTimeISO,
            }, { headers: { Authorization: `Bearer ${token}` } });
            setSuccessMessage(`Reminder for "${reminderEventTarget.title}" updated.`);
            setShowReminderModal(false);
            fetchEvents(); 
        } catch (err) {
            setReminderError(err.response?.data?.message || "Failed to save reminder.");
        } finally {
            setIsSavingReminder(false);
        }
    };

    const inputStyle = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 disabled:opacity-70";
    const labelStyle = "block text-sm font-medium text-gray-700 dark:text-gray-300";
    const buttonPrimaryStyle = "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-50";
    const buttonSecondaryStyle = "px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100 rounded-md text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400";
    const buttonDangerStyle = "px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-md text-xs font-medium";
    const buttonReminderStyle = "px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-black rounded-md text-xs font-medium";

    return (
        <div className="container mx-auto p-4 md:p-6">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">
                    Scheduling & Events {globalSelectedDepartment ? `(${globalSelectedDepartment.name})` : ''}
                </h1>
                {isAdmin && (
                    <button onClick={handleShowAddForm} className={`${buttonPrimaryStyle} bg-green-600 hover:bg-green-700`}>
                        Schedule New Event
                    </button>
                )}
            </div>

            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-300 p-4 mb-4 rounded" role="alert"><button onClick={() => setError('')} className="float-right font-bold text-lg">&times;</button>{error}</div>}
            {successMessage && !formError && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-300 p-4 mb-4 rounded" role="alert"><button onClick={() => setSuccessMessage('')} className="float-right font-bold text-lg">&times;</button>{successMessage}</div>}

            {showEventForm && isAdmin && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50"> 
                    <form onSubmit={handleSubmitEventForm} className="bg-white dark:bg-gray-800 w-full max-w-3xl p-6 rounded-lg shadow-xl max-h-[90vh] overflow-y-auto"> 
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
                                {isEditMode ? 'Edit Event' : 'Schedule New Event'}
                            </h2>
                            <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-full">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        {formError && <div className="bg-red-100 text-red-700 p-3 mb-3 rounded text-sm whitespace-pre-wrap" role="alert">{formError}</div>}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div><label htmlFor="title" className={labelStyle}>Event Title*</label><input type="text" name="title" id="title" value={eventFormData.title} onChange={handleFormInputChange} required className={inputStyle} disabled={!isAdmin || isSubmittingForm} /></div>
                            <div><label htmlFor="frequency" className={labelStyle}>Frequency*</label><select name="frequency" id="frequency" value={eventFormData.frequency} onChange={handleFormInputChange} className={inputStyle} disabled={!isAdmin || isSubmittingForm}>{EVENT_FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
                            <div className="md:col-span-2"><label htmlFor="description" className={labelStyle}>Description</label><textarea name="description" id="description" value={eventFormData.description} onChange={handleFormInputChange} rows="2" className={inputStyle} disabled={!isAdmin || isSubmittingForm}></textarea></div>
                            <div><label htmlFor="eventDepartmentId" className={labelStyle}>Department (Optional)</label><select name="departmentId" id="eventDepartmentId" value={eventFormData.departmentId} onChange={handleFormInputChange} className={inputStyle} disabled={!isAdmin || isLoadingDepartments || isSubmittingForm}><option value="">College Wide / General</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                        </div>
                        
                        <h3 className="text-md font-semibold mt-4 mb-2 text-gray-700 dark:text-gray-300">Event Timings*</h3>
                        {eventFormData.eventTimings.map((timing, index) => (
                            <div key={index} className="mb-3 p-3 border dark:border-gray-600 rounded-md space-y-2 bg-gray-50 dark:bg-gray-700/30">
                                <div className="flex justify-between items-center">
                                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Timing Slot {index + 1}</p>
                                    {eventFormData.eventTimings.length > 1 && isAdmin && (<button type="button" onClick={() => removeTimingSlot(index)} className={buttonDangerStyle} disabled={isSubmittingForm}>Remove Slot</button>)}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div><label htmlFor={`dayOfWeek-${index}`} className={labelStyle}>Day*</label><select id={`dayOfWeek-${index}`} value={timing.dayOfWeek} onChange={(e) => handleTimingChange(index, 'dayOfWeek', e.target.value)} className={inputStyle} disabled={!isAdmin || isSubmittingForm}>{DAYS_OF_WEEK.map(day => <option key={day} value={day}>{day}</option>)}</select></div>
                                    <div><label htmlFor={`startTime-${index}`} className={labelStyle}>Start Time*</label><select id={`startTime-${index}`} value={timing.startTime} onChange={(e) => handleTimingChange(index, 'startTime', e.target.value)} className={inputStyle} disabled={!isAdmin || isSubmittingForm}>{TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                    <div><label htmlFor={`endTime-${index}`} className={labelStyle}>End Time*</label><select id={`endTime-${index}`} value={timing.endTime} onChange={(e) => handleTimingChange(index, 'endTime', e.target.value)} className={inputStyle} disabled={!isAdmin || isSubmittingForm}>{TIME_OPTIONS.filter(t => timeToMinutes(t) > timeToMinutes(timing.startTime)).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                </div>
                                {eventFormData.frequency === 'ONCE' && (
                                    <div><label htmlFor={`specificDate-${index}`} className={labelStyle}>Specific Date*</label><input type="date" id={`specificDate-${index}`} value={timing.specificDate} onChange={(e) => handleTimingChange(index, 'specificDate', e.target.value)} required={eventFormData.frequency === 'ONCE'} className={inputStyle} disabled={!isAdmin || isSubmittingForm} /></div>
                                )}
                            </div>
                        ))}
                        {isAdmin && <button type="button" onClick={addTimingSlot} className={`${buttonSecondaryStyle} text-xs mt-1 mb-4`} disabled={isSubmittingForm}>+ Add Another Timing Slot</button>}

                        <div className="mt-4 p-3 border dark:border-gray-600 rounded-md">
                             <h3 className="text-md font-semibold mb-2 text-gray-700 dark:text-gray-300">Assign Specific Room(s) (Optional)</h3>
                             {rooms.length > 0 ? (
                                <div className="max-h-48 overflow-y-auto space-y-1 border dark:border-gray-500 rounded p-2">
                                    {rooms.map(room => (
                                        <label key={room.id} className="flex items-center space-x-2 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={(eventFormData.assignedRoomIds || []).includes(room.id)}
                                                onChange={() => handleRoomSelectionChange(room.id)}
                                                className="form-checkbox h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-500 rounded focus:ring-indigo-500"
                                                disabled={!isAdmin || isSubmittingForm}
                                            />
                                            <span className="text-sm text-gray-700 dark:text-gray-300">
                                                {room.roomNumber} ({room.category}, Cap: {room.capacity})
                                                {room.features && room.features.length > 0 && <span className="text-xs text-gray-500 dark:text-gray-400"> - Features: {room.features.join(', ')}</span>}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                             ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-400">No rooms available for selection. Please add rooms in Room Management.</p>
                             )}
                             <button type="button" onClick={handleCheckClashes} className={`${buttonSecondaryStyle} mt-3 w-full sm:w-auto`} disabled={isCheckingClashes || eventFormData.eventTimings.length === 0}>
                                {isCheckingClashes ? 'Checking...' : 'Check for Timetable Clashes'}
                             </button>
                        </div>

                        {clashCheckResult && (
                            <div className={`mt-4 p-3 rounded text-sm ${clashCheckResult.clashes?.length > 0 ? 'bg-yellow-100 dark:bg-yellow-700/30 text-yellow-700 dark:text-yellow-200 border border-yellow-400 dark:border-yellow-600' : 'bg-green-100 dark:bg-green-700/30 text-green-700 dark:text-green-200 border border-green-400 dark:border-green-600'}`}>
                                <p className="font-semibold">{clashCheckResult.message}</p>
                                {clashCheckResult.clashes?.length > 0 && (
                                    <ul className="list-disc list-inside mt-1 max-h-32 overflow-y-auto">
                                        {clashCheckResult.clashes.map((clash, idx) => (
                                            <li key={idx}>
                                                Event on {clash.eventTiming.day} ({clash.eventTiming.start}-{clash.eventTiming.end}{clash.eventTiming.date ? ` on ${clash.eventTiming.date}` : ''})
                                                clashes with: {clash.clashedSlot.type} slot for {clash.clashedSlot.subject || clash.clashedSlot.division || 'N/A'}
                                                {clash.clashedSlot.room && ` in Room ${clash.clashedSlot.room}`}.
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        <div className="mt-6 flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3">
                            <button type="button" onClick={resetForm} className={buttonSecondaryStyle} disabled={isSubmittingForm}>Cancel</button>
                            {isAdmin && (
                                <button type="submit" className={buttonPrimaryStyle} disabled={isSubmittingForm || isCheckingClashes}>
                                    {isSubmittingForm ? (isEditMode ? 'Updating...' : 'Scheduling...') : (isEditMode ? 'Update Event' : 'Schedule Event')}
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            )}

            <div className="mt-8">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Scheduled Events</h2>
                {isLoadingEvents && <div className="text-center py-6"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading events...</p></div>}
                {!isLoadingEvents && events.length === 0 && <p className="text-gray-500 dark:text-gray-400">No events scheduled or found matching criteria.</p>}
                {!isLoadingEvents && events.length > 0 && (
                    <div className="space-y-4">
                        {events.map(event => (
                            <div key={event.id} className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow border dark:border-gray-700 hover:shadow-md transition-shadow">
                                <div className="flex flex-col sm:flex-row justify-between items-start">
                                    <div>
                                        <h3 className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">{event.title}</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Frequency: {event.frequency}
                                            {event.department && ` | Dept: ${event.department.name}`}
                                            {event.assignedRooms && event.assignedRooms.length > 0 && 
                                                ` | Room(s): ${event.assignedRooms.map(r => `${r.roomNumber} (${r.category})`).join(', ')}`
                                            }
                                        </p>
                                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{event.description}</p>
                                        {event.reminderEnabled && event.reminderDateTime && (
                                            <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline mr-1" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                                </svg>
                                                Reminder: {new Date(event.reminderDateTime).toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                    {isAdmin && ( 
                                        <div className="flex space-x-2 mt-2 sm:mt-0 flex-shrink-0">
                                            <button onClick={() => handleShowReminderModal(event)} className={`${buttonReminderStyle} text-xs`}>Reminder</button>
                                            <button onClick={() => handleShowEditForm(event)} className={`${buttonSecondaryStyle} text-xs`}>Edit</button>
                                            <button onClick={() => handleDeleteEvent(event.id, event.title)} className={`${buttonDangerStyle} text-xs`}>Delete</button>
                                        </div>
                                    )}
                                </div>
                                <div className="mt-2 space-y-1">
                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Timings:</p>
                                    {event.eventTimings.map(et => (
                                        <div key={et.id} className="pl-2 text-xs text-gray-700 dark:text-gray-300">
                                            - {et.dayOfWeek}: {et.startTime} - {et.endTime}
                                            {event.frequency === 'ONCE' && et.specificDate ? ` (Date: ${new Date(et.specificDate).toLocaleDateString()})` : ''}
                                        </div>
                                    ))}
                                </div>
                                 <p className="text-xxs text-gray-400 dark:text-gray-500 mt-2">Created by: {event.createdByUser?.email || 'N/A'} on {new Date(event.createdAt).toLocaleDateString()}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showReminderModal && reminderEventTarget && isAdmin && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Set Reminder for "{reminderEventTarget.title}"</h3>
                        {reminderError && <p className="text-red-500 text-sm mb-2">{reminderError}</p>}
                        <div className="space-y-4">
                            <label className="flex items-center space-x-2">
                                <input 
                                    type="checkbox" 
                                    checked={reminderEnabledState} 
                                    onChange={(e) => setReminderEnabledState(e.target.checked)}
                                    className="form-checkbox h-5 w-5 text-blue-600 dark:bg-gray-700 border-gray-300 dark:border-gray-500 rounded"
                                    disabled={!isAdmin || isSavingReminder}
                                />
                                <span className={labelStyle}>Enable Reminder</span>
                            </label>
                            {reminderEnabledState && (
                                <div>
                                    <label htmlFor="reminderDateTime" className={labelStyle}>Reminder Date & Time*</label>
                                    <input 
                                        type="datetime-local" 
                                        id="reminderDateTime"
                                        value={reminderDateTimeState}
                                        onChange={(e) => setReminderDateTimeState(e.target.value)}
                                        className={inputStyle}
                                        required={reminderEnabledState}
                                        disabled={!isAdmin || isSavingReminder}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="mt-6 flex justify-end space-x-3">
                            <button onClick={() => setShowReminderModal(false)} className={buttonSecondaryStyle} disabled={isSavingReminder}>Cancel</button>
                            <button onClick={handleSaveReminder} className={buttonPrimaryStyle} disabled={isSavingReminder || !isAdmin}>
                                {isSavingReminder ? 'Saving...' : 'Save Reminder'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default EventSchedulingPage;
