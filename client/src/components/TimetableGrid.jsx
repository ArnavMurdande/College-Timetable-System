// File: client/src/components/TimetableGrid.jsx

import React from 'react';
import dypatilLogo from '../assets/images/dy-patil-logo.png';
import './TimetableGrid.css'; // Import the CSS file

const generateDisplayTimeSlots = (startTimeStr, endTimeStr, intervalMinutes = 60) => {
    const slots = [];
    // Fallback if start/end times are invalid
    if (!startTimeStr || !endTimeStr || !startTimeStr.includes(':') || !endTimeStr.includes(':')) {
        let h = 9; // Default start hour
        while(h < 17) { // Default end hour
            slots.push({
                start: `${String(h).padStart(2, '0')}:00`,
                end: `${String(h + 1).padStart(2, '0')}:00`
            });
            h++;
        }
        return slots;
    }
    let currentHour = parseInt(startTimeStr.split(':')[0]);
    let currentMinute = parseInt(startTimeStr.split(':')[1]);
    const endHour = parseInt(endTimeStr.split(':')[0]);
    const endMinute = parseInt(endTimeStr.split(':')[1]);

    while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
        const nextHourCalc = currentMinute + intervalMinutes >= 60 ? currentHour + 1 : currentHour;
        const nextMinuteCalc = (currentMinute + intervalMinutes) % 60;
        slots.push({
            start: `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`,
            end: `${String(nextHourCalc).padStart(2, '0')}:${String(nextMinuteCalc).padStart(2, '0')}`
        });
        currentHour = nextHourCalc;
        currentMinute = nextMinuteCalc;
    }
    return slots;
};

const timeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return NaN;
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return NaN;
    return hours * 60 + minutes;
};

const getCalculatedEndTimeInternal = (startTime, durationHours) => {
    if (!startTime || typeof startTime !== 'string' || !startTime.includes(':') || isNaN(durationHours) || durationHours <= 0) return startTime;
    const startMinutes = timeToMinutes(startTime);
    if (isNaN(startMinutes)) return ''; // Return empty if start time is invalid
    const endMinutes = startMinutes + durationHours * 60;
    const hours = Math.floor(endMinutes / 60) % 24; // Ensure hours are within 0-23 range
    const minutesValue = endMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutesValue).padStart(2, '0')}`;
};

const TimetableGrid = React.forwardRef(({
    timetableData,
    settings,
    divisionName, // Can also be facultyName or roomNumber based on viewMode
    viewMode,
    departmentName,
    academicContext,
    onSlotClick,
    onSlotDrop, // New prop for handling drop
    isPrintPreview = false,
    isAdmin = false // Added isAdmin prop
}, ref) => {

    // Basic validation for required props
    if (!timetableData || !settings || !settings.workingDays || !settings.collegeStartTime || !settings.collegeEndTime) {
        return <p className={`text-center p-4 ${isPrintPreview ? 'text-black' : 'text-gray-500 dark:text-gray-400'}`}>Timetable data or settings are incomplete.</p>;
    }

    // FIX #1: Ensure days are always in the correct order.
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const workingDays = Object.entries(settings.workingDays)
        .filter(([_, isWorking]) => isWorking)
        .map(([day]) => day)
        .sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));


    const displayTimeSlots = generateDisplayTimeSlots(settings.collegeStartTime, settings.collegeEndTime, 60);

    // Map to store processed slot data for quick lookup
    const slotMap = new Map();
    timetableData.forEach(slot => {
        if (!slot.startTime || !slot.endTime || !slot.dayOfWeek) return; // Skip if essential time/day info is missing

        const startMinutes = timeToMinutes(slot.startTime);
        const endMinutes = timeToMinutes(slot.endTime);

        // Validate time strings and ensure end time is after start time
        if (isNaN(startMinutes) || isNaN(endMinutes) || endMinutes <= startMinutes) return;

        const durationHours = Math.max(1, Math.round((endMinutes - startMinutes) / 60)); // Duration in 1-hour blocks
        const key = `${slot.dayOfWeek.toUpperCase()}-${slot.startTime}`;
        
        // Process academic slots (including placeholders like DISPLAY_xxx) and event slots
        if (slot.originalTask && slot.originalTask.taskId) { // Academic or placeholder slots
            slotMap.set(key, { slotData: slot, duration: durationHours, isContinuation: false });
            // Mark continuation cells for multi-hour slots
            for (let i = 1; i < durationHours; i++) {
                const continuationStartTime = getCalculatedEndTimeInternal(slot.startTime, i);
                if (continuationStartTime) {
                    const continuationKey = `${slot.dayOfWeek.toUpperCase()}-${continuationStartTime}`;
                    slotMap.set(continuationKey, { slotData: slot, duration: 0, isContinuation: true });
                }
            }
        } else if (slot.slotCategory === 'Event_Scheduled' && slot.originalTask?.taskId?.startsWith('EVENT_')) { // Specifically check for EVENT_ prefix for events
             slotMap.set(key, { slotData: slot, duration: durationHours, isContinuation: false });
             for (let i = 1; i < durationHours; i++) {
                const continuationStartTime = getCalculatedEndTimeInternal(slot.startTime, i);
                if (continuationStartTime) {
                    const continuationKey = `${slot.dayOfWeek.toUpperCase()}-${continuationStartTime}`;
                    slotMap.set(continuationKey, { slotData: slot, duration: 0, isContinuation: true });
                }
            }
        }
    });

    const handleCellClick = (day, timeSlotStart, entry) => {
        if (onSlotClick && entry && entry.slotData && !entry.isContinuation && !isPrintPreview) {
            // Click on a scheduled slot (not a continuation part)
            onSlotClick({ ...entry.slotData, dayOfWeek: day }); 
        } else if (onSlotClick && !entry && !isPrintPreview) { 
            // Clicked on an empty cell
            onSlotClick({ isEmpty: true, dayOfWeek: day, startTime: timeSlotStart });
        }
    };

    // --- Drag and Drop Handlers ---
    const handleDragStart = (e, slotData) => {
        // Prevent dragging if in print preview, not admin, no task ID, it's an event, a fixed slot, or a display placeholder
        if (isPrintPreview || !isAdmin || !slotData || !slotData.originalTask || !slotData.originalTask.taskId || 
            slotData.slotCategory === 'Event_Scheduled' || slotData.originalTask.isFixed || 
            slotData.originalTask.taskId?.startsWith('DISPLAY_')) {
            e.preventDefault(); 
            return;
        }
        e.dataTransfer.setData("application/json", JSON.stringify(slotData));
        e.dataTransfer.effectAllowed = "move";
        e.currentTarget.classList.add('dragging'); // Visual feedback for dragging
    };

    const handleDragOver = (e) => { 
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = "move"; 
    };

    const handleDrop = (e, targetDay, targetStartTime) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over-cell'); // Remove visual feedback
        const draggedSlotDataString = e.dataTransfer.getData("application/json");
        if (!draggedSlotDataString) return;

        const draggedSlot = JSON.parse(draggedSlotDataString);

        // Ensure onSlotDrop callback exists and the dragged item is a valid task
        if (onSlotDrop && draggedSlot.originalTask && draggedSlot.originalTask.taskId) {
            onSlotDrop(draggedSlot, targetDay, targetStartTime);
        }
    };
    
    const handleDragEnd = (e) => {
        e.currentTarget.classList.remove('dragging'); // Clean up visual feedback
    };

    // Visual feedback for cells being dragged over
    const handleDragEnterCell = (e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over-cell'); };
    const handleDragLeaveCell = (e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-over-cell'); };


    // Determines the applicable break time based on settings and current view
    const getApplicableBreakTimes = () => {
        if (viewMode === 'division' && settings.useAlternateBreaks && settings.alternateBreakAssignments && divisionName) {
            const assignment = settings.alternateBreakAssignments.find(a => a.divisionName === divisionName);
            if (assignment && assignment.breakStartTime) {
                if(assignment.breakStartTime === settings.alternateBreak1StartTime) return { start: settings.alternateBreak1StartTime, end: getCalculatedEndTimeInternal(settings.alternateBreak1StartTime, 1), label: "ALT BREAK 1" };
                if(assignment.breakStartTime === settings.alternateBreak2StartTime) return { start: settings.alternateBreak2StartTime, end: getCalculatedEndTimeInternal(settings.alternateBreak2StartTime, 1), label: "ALT BREAK 2" };
            }
        }
        // Default to primary break if no alternate break applies or alternate breaks are not used
        if (settings.primaryBreakStartTime) return { start: settings.primaryBreakStartTime, end: getCalculatedEndTimeInternal(settings.primaryBreakStartTime, 1), label: "BREAK" };
        return null; // No break applicable
    };

    const applicableBreak = getApplicableBreakTimes();
    // Contextual title for the timetable (e.g., Class: SE-A, Faculty: Prof. X, Room: 301)
    let timetableTitleContext = viewMode === 'faculty' ? `Faculty: ${divisionName || 'N/A'}` : viewMode === 'room' ? `Room: ${divisionName || 'N/A'}` : `Class: ${divisionName || 'N/A'}`;

    const rootDivClass = `timetable-print-area ${isPrintPreview ? 'is-print-preview' : 'timetable-print-area-screen'}`;
    
    return (
        <div className={rootDivClass} ref={ref}>
            {/* Print Header: Shown only in print preview mode */}
            {isPrintPreview && (
                <div className="print-header">
                    <div className="print-logo-box">
                        {/* Added onError fallback for the logo */}
                        <img src={dypatilLogo} alt="Logo" className="print-logo-image" onError={(e) => { e.target.style.display = 'none'; }} />
                    </div>
                    <div className="print-details-section">
                        <h1 className="print-details-college-name">RAMRAO ADIK INSTITUTE OF TECHNOLOGY</h1>
                        <h2 className="print-details-college-address">D. Y. PATIL VIDYANAGAR, SECTOR - 7, NERUL, NAVI MUMBAI - 400 706</h2>
                        <h3 className="print-details-department">Department of {departmentName}</h3>
                        <h4 className="print-details-academic-context">Time Table {academicContext}</h4>
                        <h4 className="print-details-class-title">{timetableTitleContext}</h4>
                    </div>
                </div>
            )}

            {/* Timetable Table */}
            <div className={`${isPrintPreview ? '' : 'overflow-x-auto shadow-lg rounded-md'}`}>
                <table className={`min-w-full border-collapse table-fixed ${isPrintPreview ? 'timetable-table-print' : 'timetable-table-screen border dark:border-gray-700'}`}>
                    <thead className={`${isPrintPreview ? '' : 'bg-gray-100 dark:bg-gray-800'}`}>
                        <tr>
                            <th className={`${isPrintPreview ? '' : 'p-2 border-b dark:border-gray-700 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-24'}`}>Day/Time</th>
                            {displayTimeSlots.map((ts, index) => (
                                <th key={index} className={`${isPrintPreview ? '' : 'p-2 border-b dark:border-gray-700 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'}`}>
                                    {ts.start} - {ts.end}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {workingDays.map((day) => (
                            <tr key={day} className={`${isPrintPreview ? '' : 'bg-white dark:bg-gray-900 even:bg-gray-50 dark:even:bg-gray-800/50'}`}>
                                <td className={`font-semibold ${isPrintPreview ? 'print-bg-day-header' : 'p-2 border-b dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 text-center'}`}>{day}</td>
                                {displayTimeSlots.map((timeSlot) => {
                                    const slotKey = `${day.toUpperCase()}-${timeSlot.start}`;
                                    const entry = slotMap.get(slotKey);

                                    // If this cell is a continuation of a previous multi-hour slot, skip rendering
                                    if (entry && entry.isContinuation) return null;

                                    let cellContent = <div className={`${isPrintPreview ? '' : 'h-24'}`}>&nbsp;</div>; // Default empty cell
                                    let cellColSpan = 1;
                                    let cellPrintClass = ''; 
                                    let cellScreenClass = `p-1 border-b dark:border-gray-700 text-xs text-center align-middle`; 

                                    const slotStartTimeMinutes = timeToMinutes(timeSlot.start);
                                    const slotEndTimeMinutes = timeToMinutes(timeSlot.end);
                                    let isBreakCell = false;

                                    // Check if the current cell falls within a break period
                                    if (applicableBreak && slotStartTimeMinutes < timeToMinutes(applicableBreak.end) && slotEndTimeMinutes > timeToMinutes(applicableBreak.start)) {
                                        isBreakCell = true;
                                        // If this is the start of the break, render the break label and span columns
                                        if (slotStartTimeMinutes === timeToMinutes(applicableBreak.start)) {
                                            cellColSpan = Math.max(1, Math.round((timeToMinutes(applicableBreak.end) - timeToMinutes(applicableBreak.start)) / 60));
                                            cellContent = <div className={`font-bold ${isPrintPreview ? '' : 'text-sm text-gray-700 dark:text-gray-300'}`}>{applicableBreak.label}</div>;
                                            cellPrintClass = 'print-bg-break';
                                            cellScreenClass += ' bg-yellow-100 dark:bg-yellow-700/30 text-yellow-700 dark:text-yellow-300';
                                        } else { 
                                            // This cell is part of a break but not the start, so it's covered by colspan
                                            return null; 
                                        }
                                    }

                                    // If not a break cell and there's an entry for this slot
                                    if (!isBreakCell && entry && entry.slotData) {
                                        const scheduledSlot = entry.slotData;
                                        cellColSpan = entry.duration; // Duration in 1-hour blocks for colspan
                                        
                                        // Determine background color based on slot category
                                        let bgColorScreen = 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'; // Default for Lecture
                                        let bgColorPrint = 'print-bg-lecture';

                                        if (scheduledSlot.slotCategory === 'Lab') {
                                            bgColorScreen = 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300';
                                            bgColorPrint = 'print-bg-lab';
                                        } else if (scheduledSlot.slotCategory === 'Event_Scheduled') {
                                            bgColorScreen = 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
                                            bgColorPrint = 'print-bg-event';
                                        }
                                        cellScreenClass += ` ${bgColorScreen}`;
                                        cellPrintClass = bgColorPrint;
                                        
                                        // Prepare display strings for the slot content
                                        let mainDisplay = scheduledSlot.originalTask?.subjectName || scheduledSlot.subjectCode || "N/A";
                                        let subDisplay = (scheduledSlot.originalTask?.subjectName && scheduledSlot.originalTask?.subjectCode && scheduledSlot.originalTask.subjectName.toLowerCase() !== scheduledSlot.originalTask.subjectCode.toLowerCase()) 
                                                         ? `(${scheduledSlot.originalTask.subjectCode})` 
                                                         : '';
                                        
                                        // Special display for placeholder course group slots
                                        if (scheduledSlot.originalTask?.displayCourseGroup && scheduledSlot.originalTask.courseGroup) {
                                            mainDisplay = scheduledSlot.originalTask.courseGroup;
                                            subDisplay = scheduledSlot.originalTask.subjectType 
                                                         ? `(${scheduledSlot.originalTask.subjectType}${scheduledSlot.slotCategory === 'Lab' ? ' Lab' : ''})` 
                                                         : (scheduledSlot.slotCategory === 'Lab' ? '(Lab)' : '');
                                        } else if (scheduledSlot.slotCategory === 'Lab') {
                                            subDisplay += (subDisplay ? ' ' : '') + '(Lab)';
                                        } else if (scheduledSlot.slotCategory === 'Event_Scheduled') {
                                            mainDisplay = scheduledSlot.originalTask?.subjectName || 'Event'; // Use event title
                                            subDisplay = `(${scheduledSlot.roomNumber || 'General'})`; // Show room for event, or "General"
                                        }


                                        cellContent = (
                                            <div 
                                                className={isPrintPreview ? "slot-content-print" : "timetable-slot-screen"}
                                                // Conditional draggability based on isAdmin and slot properties
                                                draggable={!isPrintPreview && isAdmin && scheduledSlot.originalTask?.taskId && 
                                                           scheduledSlot.slotCategory !== 'Event_Scheduled' && 
                                                           !scheduledSlot.originalTask.isFixed && 
                                                           !scheduledSlot.originalTask.taskId?.startsWith('DISPLAY_')}
                                                onDragStart={(e) => handleDragStart(e, scheduledSlot)}
                                                onDragEnd={handleDragEnd}
                                            >
                                                <span className={isPrintPreview ? "slot-content-print-main" : "main-display"}>{mainDisplay}</span>
                                                {subDisplay && <span className={isPrintPreview ? "slot-content-print-sub" : "sub-display"}>{subDisplay}</span>}
                                                {/* For course group placeholders, show "Multiple" for faculty/room */}
                                                <span className={isPrintPreview ? "slot-content-print-detail" : "detail-display"}>
                                                    {scheduledSlot.facultyName || (scheduledSlot.originalTask?.displayCourseGroup ? 'Multiple' : 'N/A')}
                                                </span>
                                                <span className={isPrintPreview ? "slot-content-print-detail" : "detail-display"}>
                                                    Rm: {scheduledSlot.roomNumber || (scheduledSlot.originalTask?.displayCourseGroup ? 'Multiple' : 'N/A')}
                                                </span>
                                                {scheduledSlot.batchName && <span className={isPrintPreview ? "slot-content-print-batch" : "batch-display"}>({scheduledSlot.batchName})</span>}
                                            </div>
                                        );
                                    }
                                    
                                    const finalCellClasses = isPrintPreview ? cellPrintClass : cellScreenClass;
                                    // Make non-break cells clickable (including empty ones) when not in print preview
                                    const clickableClass = (!isPrintPreview && (entry || !isBreakCell)) ? 'hover:shadow-md cursor-pointer hover:ring-1 hover:ring-indigo-400 transition-shadow' : '';


                                    return (
                                        <td key={`${day}-${timeSlot.start}`} 
                                            colSpan={cellColSpan}
                                            className={`${finalCellClasses} ${clickableClass}`}
                                            onClick={() => handleCellClick(day, timeSlot.start, entry)}
                                            onDragOver={handleDragOver} 
                                            onDrop={(e) => handleDrop(e, day, timeSlot.start)} 
                                            onDragEnter={handleDragEnterCell}
                                            onDragLeave={handleDragLeaveCell}
                                        >
                                            {cellContent}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {/* Print Footer: Shown only in print preview mode */}
            {isPrintPreview && (
                <div className="print-footer">
                    <span className="print-footer-text">Head of Department</span>
                    <span className="print-footer-text">Principal</span>
                </div>
            )}
            {/* Inline styles for drag feedback (can be moved to CSS file) */}
            <style jsx>{`
                .dragging { opacity: 0.5; border: 2px dashed #3b82f6; }
                .drag-over-cell { background-color: rgba(59, 130, 246, 0.1) !important; border: 1px dashed #3b82f6 !important; }
            `}</style>
        </div>
    );
});

export default TimetableGrid;
