// File: server/routes/timetableRoutes.js

import express from 'express';
import { PrismaClient, SubjectType, DayOfWeek, SlotCategory, DivisionType, EventFrequency } from '@prisma/client';
import { protect, authorize } from '../middleware/authMiddleware.js';

const prisma = new PrismaClient();
const router = express.Router();

// --- Helper Functions ---
const calculateSemesterNumberInternal = (year, semesterType) => {
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) return null;
    const semTypeLower = String(semesterType).toLowerCase();
    if (semTypeLower === 'odd') return yearNum * 2 - 1;
    if (semTypeLower === 'even') return yearNum * 2;
    return null;
};

const timeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return 0;
    const parts = timeStr.split(':');
    if (parts.length !== 2) return 0;
    const [hours, minutes] = parts.map(Number);
    if (isNaN(hours) || isNaN(minutes)) return 0;
    return hours * 60 + minutes;
};

const minutesToTime = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const getCalculatedEndTimeInternal = (startTime, durationHours) => {
    if (!startTime || typeof startTime !== 'string' || !startTime.includes(':') || isNaN(durationHours) || durationHours <= 0) return startTime;
    const startMinutesNum = timeToMinutes(startTime);
    if (isNaN(startMinutesNum)) return '';
    const totalEndMinutes = startMinutesNum + durationHours * 60;
    return minutesToTime(totalEndMinutes);
};

const THEORY_DURATION_HOURS = 1;
const LAB_DURATION_HOURS = 2;


router.use(protect);

// --- NEW ROUTE: Get distinct course groups for UI ---
router.get('/subjects/distinct-course-groups', authorize('Admin'), async (req, res, next) => {
    const { departmentId, year, semesterType } = req.query;
    if (!departmentId || !year || !semesterType) {
        return res.status(400).json({ message: "Department, Year, and Semester Type are required." });
    }
    const calculatedSemester = calculateSemesterNumberInternal(year, semesterType);
    if (!calculatedSemester) return res.status(400).json({ message: "Invalid Year or Semester Type." });
    try {
        const subjectsWithGroups = await prisma.subject.findMany({
            where: {
                departmentId: parseInt(departmentId),
                year: parseInt(year),
                semester: calculatedSemester,
                courseGroup: { not: null },
                subjectType: { in: ['DLO', 'ILOT', 'MajorMinor'] }
            },
            select: { subjectType: true, courseGroup: true },
            distinct: ['subjectType', 'courseGroup']
        });

        const courseGroups = { DLO: [], ILOT: [], MajorMinor: [] };
        subjectsWithGroups.forEach(s => {
            if (s.subjectType && s.courseGroup && courseGroups[s.subjectType]) {
                if (!courseGroups[s.subjectType].includes(s.courseGroup)) {
                    courseGroups[s.subjectType].push(s.courseGroup);
                }
            }
        });
        Object.keys(courseGroups).forEach(key => courseGroups[key].sort());

        res.status(200).json(courseGroups);
    } catch (error) {
        console.error("Error fetching distinct course groups:", error);
        next(error);
    }
});


// --- Preset Routes ---

// GET presets
router.get('/presets', authorize('Admin'), async (req, res) => {
    const { departmentId, year, semesterType } = req.query;
    if (!departmentId || !year || !semesterType) {
        return res.status(400).json({ message: "Department, Year, and Semester Type are required." });
    }
    const calculatedSemester = calculateSemesterNumberInternal(year, semesterType);
    if (!calculatedSemester) {
        return res.status(400).json({ message: "Invalid Year or Semester Type." });
    }
    try {
        const presets = await prisma.timetablePreset.findMany({
            where: {
                departmentId: parseInt(departmentId),
                year: parseInt(year),
                semester: calculatedSemester,
            },
            orderBy: { name: 'asc' }
        });
        const presetsWithSettings = presets.map(p => ({...p, settings: p.rules}));
        res.status(200).json(presetsWithSettings);
    } catch (error) {
        console.error("Failed to fetch presets:", error);
        res.status(500).json({ message: 'Failed to fetch presets.', error: error.message });
    }
});

// FIX 3: Modified POST to handle create and update (upsert)
router.post('/presets', authorize('Admin'), async (req, res) => {
    const { name, departmentId, year, semesterType, settings } = req.body;
    if (!name || !departmentId || !year || !semesterType || !settings) {
        return res.status(400).json({ message: "Name, department, year, semester, and settings object are required." });
    }
    const calculatedSemester = calculateSemesterNumberInternal(year, semesterType);
    if (!calculatedSemester) {
        return res.status(400).json({ message: "Invalid Year or Semester Type." });
    }
    try {
        const preset = await prisma.timetablePreset.upsert({
            where: {
                unique_preset_per_sem: {
                    name: name,
                    departmentId: parseInt(departmentId),
                    year: parseInt(year),
                    semester: calculatedSemester,
                }
            },
            update: {
                rules: settings,
                userId: req.user.id, // Update who last modified it
            },
            create: {
                name,
                departmentId: parseInt(departmentId),
                year: parseInt(year),
                semester: calculatedSemester,
                userId: req.user.id,
                rules: settings,
            }
        });
        const message = preset.createdAt.getTime() === preset.updatedAt.getTime()
            ? `Preset '${name}' created successfully.`
            : `Preset '${name}' updated successfully.`;
        res.status(201).json({ message, preset });
    } catch (error) {
        console.error("Failed to save/update preset:", error);
        res.status(500).json({ message: 'Failed to create or update preset.', error: error.message });
    }
});


// DELETE presets
router.delete('/presets/:id', authorize('Admin'), async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.timetablePreset.delete({ where: { id: parseInt(id) } });
        res.status(204).send();
    } catch (error) {
        console.error("Failed to delete preset:", error);
        if (error.code === 'P2025') return res.status(404).json({ message: "Preset not found." });
        res.status(500).json({ message: 'Failed to delete preset.', error: error.message });
    }
});

// --- The /generate route ---
router.post('/generate', authorize('Admin'), async (req, res, next) => {
    const settings = req.body;
    
    const { gaPopulationSize, gaMaxGenerations, gaMutationRate, gaCrossoverRate, gaElitismCount, ...loggableSettings } = settings;
    console.log(`[GA Backend] Timetable Generation Request with settings (excluding GA params):`, loggableSettings);
    console.log('[GA Backend] DayOfWeek Enum Structure from Prisma Client:', JSON.stringify(DayOfWeek, null, 2));

    const calculatedSemester = calculateSemesterNumberInternal(settings.year, settings.semesterType);
    if (!calculatedSemester) return res.status(400).json({ message: "Invalid year or semester type." });

    const deptIdNum = parseInt(settings.departmentId);
    const yearNum = parseInt(settings.year);
    const academicSessionStartYear = parseInt(settings.academicSessionStartYear);

    try {
        console.log(`[GA Backend] Fetching all necessary data...`);
        // --- Data Fetching ---
        const department = await prisma.department.findUnique({ where: { id: deptIdNum } });
        if (!department) return res.status(404).json({ message: "Department not found." });

        const subjects = await prisma.subject.findMany({
            where: { departmentId: deptIdNum, year: yearNum, semester: calculatedSemester },
            select: { id: true, code: true, name: true, subjectType: true, courseGroup: true, courseCategory: true, theoryHours: true, practicalHours: true, labRequirements: true, avgStudentsPerDivision: true, avgStudentsPerBatch: true }
        });
        if (subjects.length === 0) return res.status(400).json({ message: `No subjects found for ${department.name}, Year ${yearNum}, Sem ${calculatedSemester}. Ensure subjects are added and match criteria.` });

        const allDivisionsInContext = await prisma.division.findMany({ 
            where: { departmentId: deptIdNum, year: yearNum, semester: calculatedSemester },
            include: {
                batches: { select: { id: true, name: true, permanentDivisionId: true } },
                composedOfPermanentBatches: { select: { id: true, name: true, permanentDivisionId: true, permanentDivision: {select: {name: true, id: true}} } }
            }
        });
        if (allDivisionsInContext.length === 0) return res.status(400).json({ message: "No divisions found for the selected criteria. Ensure divisions are defined." });
        const commonPermanentDivisions = allDivisionsInContext.filter(d => d.divisionType === DivisionType.Permanent && (d.linkedSubjectType === SubjectType.Common || !d.linkedSubjectType));


        const facultyMembers = await prisma.faculty.findMany({
            select: { id: true, name: true, uniqueId: true, designation: true, departmentId: true }
        });
        if (facultyMembers.length === 0) return res.status(400).json({ message: "No faculty members found. Ensure faculty are added." });

        const rooms = await prisma.room.findMany({
            where: { OR: [{ departmentId: deptIdNum }, { departmentId: null }] },
            select: { id: true, roomNumber: true, category: true, floor: true, capacity: true, features: true }
        });
        if (rooms.length === 0) return res.status(400).json({ message: "No rooms available. Ensure rooms are added." });

        const subjectIds = subjects.map(s => s.id);
        const loadAllocations = await prisma.loadAllocation.findMany({
            where: { subjectId: { in: subjectIds } }, 
            include: {
                subject: true, 
                faculty: { include: { department: { select: { id: true, name: true } } } },
                division: { include: { composedOfPermanentBatches: { select: { id: true, name: true, permanentDivision: {select: {name: true, id: true}} } } } },
                batch: { include: { permanentDivision: { select: { id: true, name: true } } } },
                customLabBatch: { include: { customLabGroupSet: true, composedOfPermanentBatches: { select: { id: true, name: true, permanentDivision: {select: {name: true, id: true}} } } } }
            }
        });
        if (loadAllocations.length === 0) return res.status(400).json({ message: `No load allocations found for the subjects in ${department.name}, Year ${yearNum}, Sem ${calculatedSemester}. Ensure load is allocated.` });

        const studentElectiveChoices = await prisma.studentElectiveChoice.findMany({
            where: { departmentId: deptIdNum, semester: calculatedSemester, academicYear: academicSessionStartYear },
            select: { subjectId: true, batchId: true, studentCount: true } 
        });
        const studentCountsForElectiveSubjectByBatch = {}; 
        studentElectiveChoices.forEach(sec => {
            if (!studentCountsForElectiveSubjectByBatch[sec.subjectId]) studentCountsForElectiveSubjectByBatch[sec.subjectId] = {};
            studentCountsForElectiveSubjectByBatch[sec.subjectId][sec.batchId] = sec.studentCount;
        });

        const scheduledEvents = await prisma.event.findMany({
            where: {
                OR: [{ departmentId: deptIdNum }, { departmentId: null }], 
                frequency: EventFrequency.WEEKLY, 
            },
            include: { eventTimings: true, assignedRooms: {select: {id: true, roomNumber: true}} }
        });
        
        const customLabGroupSets = await prisma.customLabGroupSet.findMany({
            where: { departmentId: deptIdNum, year: yearNum, semester: calculatedSemester },
            include: { customLabBatches: { include: { composedOfPermanentBatches: { include: { permanentDivision: {select: {name: true, id: true}} } } } } }
        });

        console.log(`[GA Backend] Defining tasks to schedule...`);
        let tasksToSchedule = [];
        let taskIdCounter = 0;

        for (const alloc of loadAllocations) {
            const subject = alloc.subject;
            if (!subject) {
                console.warn(`[GA TaskDef] Skipping LoadAllocation ID ${alloc.id} due to missing subject reference.`);
                continue;
            }
            const divisionAllocated = alloc.division;

            const calculateStudentCount = () => {
                if (alloc.allocationType === "Theory") {
                    if (divisionAllocated && divisionAllocated.divisionType === DivisionType.Temporary) {
                        let count = 0;
                        (divisionAllocated.composedOfPermanentBatches || []).forEach(permBatch => {
                            count += studentCountsForElectiveSubjectByBatch[subject.id]?.[permBatch.id] || (subject.avgStudentsPerBatch || 20); 
                        });
                        return Math.ceil(count > 0 ? count : (subject.avgStudentsPerDivision || 60));
                    }
                    return subject.avgStudentsPerDivision || 60;
                }
                else if (alloc.allocationType === "Lab") {
                    if (alloc.customLabBatchId && alloc.customLabBatch) {
                        let count = 0;
                        (alloc.customLabBatch.composedOfPermanentBatches || []).forEach(permBatch => {
                             count += studentCountsForElectiveSubjectByBatch[subject.id]?.[permBatch.id] || (subject.avgStudentsPerBatch || 20);
                        });
                         return Math.ceil(count > 0 ? count : (subject.avgStudentsPerBatch || 20));
                    } else if (alloc.batchId) { 
                        if ([SubjectType.DLO, SubjectType.ILOT, SubjectType.MajorMinor].includes(subject.subjectType)) {
                             return studentCountsForElectiveSubjectByBatch[subject.id]?.[alloc.batchId] || subject.avgStudentsPerBatch || 20;
                        }
                        return subject.avgStudentsPerBatch || 20; 
                    }
                }
                return subject.avgStudentsPerBatch || 30;
             };

            if (alloc.allocationType === "Theory" && subject.theoryHours > 0 && divisionAllocated) {
                for (let i = 0; i < subject.theoryHours; i++) {
                    taskIdCounter++;
                    tasksToSchedule.push({
                        taskId: `T_${alloc.id}_h${i + 1}_${taskIdCounter}`, type: SlotCategory.Lecture, duration: THEORY_DURATION_HOURS,
                        subjectId: subject.id, subjectCode: subject.code, subjectName: subject.name, 
                        subjectType: subject.subjectType, courseGroup: subject.courseGroup, courseCategory: subject.courseCategory,
                        facultyId: alloc.facultyId, facultyName: alloc.faculty?.name || 'N/A Faculty',
                        divisionId: divisionAllocated.id, 
                        divisionName: divisionAllocated.name,
                        divisionType: divisionAllocated.divisionType,
                        batchId: null, 
                        studentCount: calculateStudentCount(), labRequirements: []
                    });
                }
            } else if (alloc.allocationType === "Lab" && subject.practicalHours > 0) {
                const numLabSessions = Math.floor(subject.practicalHours / LAB_DURATION_HOURS);
                for (let i = 0; i < numLabSessions; i++) {
                    taskIdCounter++;
                    let taskBatchId = null;
                    let taskBatchName = null;
                    let isCustomTask = false;
                    let labContextDivisionId = divisionAllocated?.id; 
                    let labContextDivisionName = divisionAllocated?.name;

                    if (alloc.customLabBatchId && alloc.customLabBatch) {
                        taskBatchId = alloc.customLabBatchId; 
                        taskBatchName = `${alloc.customLabBatch.name}`;
                        isCustomTask = true;
                    } else if (alloc.batchId && alloc.batch) { 
                        taskBatchId = alloc.batchId;
                        taskBatchName = alloc.batch.name;
                        if(alloc.batch.permanentDivisionId && alloc.batch.permanentDivision) {
                            labContextDivisionId = alloc.batch.permanentDivisionId; 
                            labContextDivisionName = alloc.batch.permanentDivision.name;
                        }
                    } else {
                         console.warn(`[GA TaskDef] Skipping Lab task for Subject ${subject.code} (Alloc ID ${alloc.id}) due to missing batch/customLabBatch details.`);
                         continue;
                    }
                    
                    tasksToSchedule.push({
                        taskId: `L_${alloc.id}_s${i + 1}_${taskIdCounter}`, type: SlotCategory.Lab, duration: LAB_DURATION_HOURS,
                        subjectId: subject.id, subjectCode: subject.code, subjectName: subject.name, 
                        subjectType: subject.subjectType, courseGroup: subject.courseGroup, courseCategory: subject.courseCategory,
                        facultyId: alloc.facultyId, facultyName: alloc.faculty?.name || 'N/A Faculty',
                        divisionId: labContextDivisionId, 
                        divisionName: labContextDivisionName,
                        divisionType: allDivisionsInContext.find(d => d.id === labContextDivisionId)?.divisionType,
                        batchId: taskBatchId, 
                        batchName: taskBatchName,
                        isCustomLabGroup: isCustomTask,
                        studentCount: calculateStudentCount(), labRequirements: subject.labRequirements || []
                    });
                }
            }
        }
        console.log(`[GA Backend] Total tasks defined: ${tasksToSchedule.length}. Sample:`, tasksToSchedule.slice(0,3));
        if (tasksToSchedule.length === 0) return res.status(400).json({ message: "No lecture/lab tasks could be defined from load allocations. Check subject hours and load allocation data." });

        // --- Genetic Algorithm Implementation ---
        console.log("[GA Backend] Initializing Genetic Algorithm...");
        const GA_POPULATION_SIZE = settings.gaPopulationSize || 50;
        const GA_MAX_GENERATIONS = settings.gaMaxGenerations || 500;
        const GA_MUTATION_RATE = settings.gaMutationRate || 0.3;
        const GA_CROSSOVER_RATE = settings.gaCrossoverRate || 0.80;
        const GA_ELITISM_COUNT = Math.max(1, settings.gaElitismCount || 2); 
        
        const PENALTY_HARD_CONSTRAINT = 1000;         
        const PENALTY_UNASSIGNED_TASK = 10000;        
        const PENALTY_FIXED_SLOT_VIOLATION = 7500;    
        const PENALTY_INCOMPLETE_HOURS = 8000;        
        const PENALTY_BACK_TO_BACK_SAME_SUBJECT = 1500;
        const PENALTY_BREAK_VIOLATION = 5000;         
        const PENALTY_COLLEGE_HOURS_VIOLATION = 5000; 
        const PENALTY_EVENT_CLASH = 7000;             
        const PENALTY_ROOM_FEATURE_MISMATCH = 2000;
        const PENALTY_ROOM_CAPACITY = 1000;

        const dayOfWeekEnumValues = Object.values(DayOfWeek);
        const activeDayStringsFromSettings = Object.entries(settings.workingDays || {}).filter(([_, v]) => v).map(([k]) => k);
        const activeDaysForSlotGen = activeDayStringsFromSettings.filter(dayString => {
            const isIncluded = dayOfWeekEnumValues.includes(dayString);
            if (!isIncluded) console.warn(`[GA Backend] Day string '${dayString}' (from settings) is NOT in DayOfWeek enum. Excluded. Valid: ${dayOfWeekEnumValues.join(', ')}`);
            return isIncluded;
        });
        if (activeDaysForSlotGen.length === 0) return res.status(400).json({ message: "No working days selected or matched with DayOfWeek enum. Check settings." });
        
        const collegeStartMinutes = timeToMinutes(settings.collegeStartTime);
        const collegeEndMinutes = timeToMinutes(settings.collegeEndTime);
        
        const timeSlotsPerHour = {}; 
        activeDaysForSlotGen.forEach(dayEnumValue => {
            timeSlotsPerHour[dayEnumValue] = [];
            for (let t = collegeStartMinutes; t < collegeEndMinutes; t += 60) {
                timeSlotsPerHour[dayEnumValue].push(minutesToTime(t));
            }
        });
        const flatAvailableTimeSlots = Object.entries(timeSlotsPerHour).flatMap(([dayEnumValue, times]) => 
            times.map(startTime => ({ day: dayEnumValue, startTime }))
        );
        if (flatAvailableTimeSlots.length === 0) return res.status(400).json({ message: "No available teaching time slots based on college hours and working days." });
        console.log(`[GA Backend] Total flat available 1-hour time slots: ${flatAvailableTimeSlots.length}`);

        const eventBlockedSlots = new Set(); 
        scheduledEvents.forEach(event => {
            event.eventTimings.forEach(et => {
                const dayForEventKey = et.dayOfWeek;
                if (!dayOfWeekEnumValues.includes(dayForEventKey)) {
                    console.warn(`[GA EventSlots] Invalid dayOfWeek '${dayForEventKey}' from event timing ID ${et.id}. Skipping.`);
                    return;
                }
                if (event.assignedRooms && event.assignedRooms.length > 0) {
                    const eventStartMins = timeToMinutes(et.startTime);
                    const eventEndMins = timeToMinutes(et.endTime);
                    event.assignedRooms.forEach(room => {
                        for (let t = eventStartMins; t < eventEndMins; t += 60) { 
                            eventBlockedSlots.add(`${dayForEventKey}-${room.id}-${t}`);
                        }
                    });
                }
            });
        });
        console.log(`[GA Backend] Event blocked slots count: ${eventBlockedSlots.size}`);

        const fixedSlotMap = new Map();
        Object.entries(settings.labTimings?.MajorMinor || {}).forEach(([cg, rule]) => {
            if (rule.startTime && rule.dayOfWeek) {
                const dayStringFromRule = rule.dayOfWeek;
                if (dayOfWeekEnumValues.includes(dayStringFromRule)) {
                    const key = `LAB-MajorMinor-${cg}-${dayStringFromRule}-${rule.startTime}`;
                    fixedSlotMap.set(key, {
                        type: SlotCategory.Lab, subjectType: SubjectType.MajorMinor, courseGroup: cg, day: dayStringFromRule,
                        startTime: rule.startTime, endTime: getCalculatedEndTimeInternal(rule.startTime, LAB_DURATION_HOURS),
                        isMandatoryForAllDivisionsTakingGroup: true 
                    });
                } else {
                    console.warn(`[GA Settings] Invalid dayOfWeek '${dayStringFromRule}' for MajorMinor lab group ${cg}. Rule ignored.`);
                }
            }
        });
        ['DLO', 'ILOT', 'MajorMinor'].forEach(type => {
            (settings.theoryTimings?.[type] || []).forEach(rule => {
                if (rule.courseGroup && rule.day && rule.startTime) {
                    const dayStringFromRule = rule.day;
                    if (dayOfWeekEnumValues.includes(dayStringFromRule)) {
                        const key = `THEORY-${type}-${rule.courseGroup}-${dayStringFromRule}-${rule.startTime}`;
                        fixedSlotMap.set(key, {
                            type: SlotCategory.Lecture, subjectType: type, courseGroup: rule.courseGroup, day: dayStringFromRule,
                            startTime: rule.startTime, endTime: getCalculatedEndTimeInternal(rule.startTime, THEORY_DURATION_HOURS),
                            subjectNameHint: rule.subjectNameHint, isMandatoryForAllDivisionsTakingGroup: true
                        });
                    } else {
                         console.warn(`[GA Settings] Invalid day '${dayStringFromRule}' for ${type} theory group ${rule.courseGroup}. Rule ignored.`);
                    }
                }
            });
        });
        console.log(`[GA Backend] Constructed ${fixedSlotMap.size} fixed slot rules from user settings.`);


        const initializeChromosome = () => {
            let chromosome = [];
            let taskPool = JSON.parse(JSON.stringify(tasksToSchedule));
            const assignedTaskIds = new Set();
            const tempScheduleGridForInit = {};

            const markTempScheduled = (day, startTimeMinutes, endTimeMinutes, facultyId, roomId, groupIdentifier) => {
                for (let t = startTimeMinutes; t < endTimeMinutes; t += 30) {
                    tempScheduleGridForInit[`${day}-${t}-room-${roomId}`] = true;
                    tempScheduleGridForInit[`${day}-${t}-faculty-${facultyId}`] = true;
                    tempScheduleGridForInit[`${day}-${t}-group-${groupIdentifier}`] = true;
                }
            };
            const checkTempClash = (day, startTimeMinutes, endTimeMinutes, facultyId, roomId, groupIdentifier) => {
                for (let t = startTimeMinutes; t < endTimeMinutes; t += 30) {
                    if (tempScheduleGridForInit[`${day}-${t}-room-${roomId}`]) return `Room ${roomId} clash`;
                    if (tempScheduleGridForInit[`${day}-${t}-faculty-${facultyId}`]) return `Faculty ${facultyId} clash`;
                    if (tempScheduleGridForInit[`${day}-${t}-group-${groupIdentifier}`]) return `Group ${groupIdentifier} clash`;
                }
                for (let t_event = startTimeMinutes; t_event < endTimeMinutes; t_event += 60) { 
                    if (eventBlockedSlots.has(`${day}-${roomId}-${t_event}`)) return `Event clash Room ${roomId}`;
                }
                return null;
            };

            // --- INTEGRATION: PHASE 1 - Place SPECIFIC fixed lab tasks first ---
            if (settings.labTimings?.labTimingType === 'Specific' && Array.isArray(settings.labTimings?.specificSlots)) {
                console.log('[GA Init] Processing specific lab slot assignments...');
                settings.labTimings.specificSlots.forEach(slotRule => {
                    if (slotRule.dayOfWeek && slotRule.startTime && Array.isArray(slotRule.assignments)) {
                        const ruleDay = slotRule.dayOfWeek;
                        const ruleStartTime = slotRule.startTime;
                        const ruleEndTime = getCalculatedEndTimeInternal(ruleStartTime, LAB_DURATION_HOURS);
                        const ruleStartMinutes = timeToMinutes(ruleStartTime);
                        const ruleEndMinutes = timeToMinutes(ruleEndTime);
                        
                        slotRule.assignments.forEach(assign => {
                            const taskToFix = taskPool.find(t =>
                                !assignedTaskIds.has(t.taskId) &&
                                t.type === SlotCategory.Lab &&
                                t.subjectId === assign.subjectId &&
                                (assign.isCustomGroup ? (t.isCustomLabGroup && t.batchId === assign.customLabBatchId) : (!t.isCustomLabGroup && t.batchId === assign.batchId))
                            );

                            if (taskToFix) {
                                let placed = false;
                                const suitableRooms = rooms.filter(r => 
                                    r.category === 'Lab' &&
                                    r.capacity >= taskToFix.studentCount &&
                                    (taskToFix.labRequirements || []).every(req => (r.features || []).includes(req))
                                ).sort((a,b) => a.capacity - b.capacity);

                                for (const room of suitableRooms) {
                                    const groupIdentifier = taskToFix.isCustomLabGroup ? `customlab-${taskToFix.batchId}` : `batch-${taskToFix.batchId}`;
                                    const clashReason = checkTempClash(ruleDay, ruleStartMinutes, ruleEndMinutes, taskToFix.facultyId, room.id, groupIdentifier);
                                    if (!clashReason) {
                                        chromosome.push({
                                            taskId: taskToFix.taskId, originalTask: taskToFix, day: ruleDay, 
                                            startTime: ruleStartTime, endTime: ruleEndTime, roomId: room.id,
                                            facultyId: taskToFix.facultyId, divisionId: taskToFix.divisionId,
                                            batchId: taskToFix.batchId, unassigned: false, isFixed: true
                                        });
                                        assignedTaskIds.add(taskToFix.taskId);
                                        markTempScheduled(ruleDay, ruleStartMinutes, ruleEndMinutes, taskToFix.facultyId, room.id, groupIdentifier);
                                        placed = true;
                                        break; 
                                    }
                                }
                                if (!placed) {
                                    console.warn(`[GA Init] Could not place specific fixed task ${taskToFix.taskId} due to clashes. Marking as unassigned.`);
                                    chromosome.push({ taskId: taskToFix.taskId, originalTask: taskToFix, unassigned: true, isFixed: true });
                                    assignedTaskIds.add(taskToFix.taskId);
                                }
                            }
                        });
                    }
                });
            }

            // --- PHASE 2: Place group-based fixed tasks (from fixedSlotMap) ---
            fixedSlotMap.forEach((rule, ruleKey) => {
                const tasksMatchingRule = taskPool.filter(task =>
                    !assignedTaskIds.has(task.taskId) && // CRUCIAL: Don't re-process tasks fixed in Phase 1
                    task.type === rule.type && 
                    task.subjectType.toString() === rule.subjectType.toString() && task.courseGroup === rule.courseGroup &&
                    (!rule.subjectNameHint || task.subjectName.includes(rule.subjectNameHint) || task.subjectCode.includes(rule.subjectNameHint))
                );
                if (tasksMatchingRule.length === 0) return;
                const ruleStartMinutes = timeToMinutes(rule.startTime);
                const ruleEndMinutes = timeToMinutes(rule.endTime);
                let availableRoomsForRule = rooms.filter(r => 
                    (rule.type === SlotCategory.Lab && r.category === 'Lab') || (rule.type === SlotCategory.Lecture && r.category === 'Lecture')
                ).sort((a,b) => a.capacity - b.capacity);

                tasksMatchingRule.forEach(taskToAssign => {
                    if (assignedTaskIds.has(taskToAssign.taskId)) return;
                    let placedThisTask = false;
                    for (const potentialRoom of availableRoomsForRule) {
                        const studentCount = taskToAssign.studentCount || (taskToAssign.type === SlotCategory.Lab ? 20 : 60);
                        const roomCapacityOk = potentialRoom.capacity >= studentCount;
                        const roomFeaturesOk = taskToAssign.type !== SlotCategory.Lab || (taskToAssign.labRequirements || []).every(req => (potentialRoom.features || []).includes(req));
                        if (roomCapacityOk && roomFeaturesOk) {
                            const groupIdentifier = taskToAssign.isCustomLabGroup ? `customlab-${taskToAssign.batchId}` : (taskToAssign.batchId ? `batch-${taskToAssign.batchId}` : `div-${taskToAssign.divisionId}`);
                            const clashReason = checkTempClash(rule.day, ruleStartMinutes, ruleEndMinutes, taskToAssign.facultyId, potentialRoom.id, groupIdentifier);
                            if (!clashReason) {
                                chromosome.push({
                                    taskId: taskToAssign.taskId, originalTask: taskToAssign, day: rule.day, 
                                    startTime: rule.startTime, endTime: rule.endTime, 
                                    roomId: potentialRoom.id, facultyId: taskToAssign.facultyId,
                                    divisionId: taskToAssign.divisionId, batchId: taskToAssign.batchId,
                                    unassigned: false, isFixed: true, displayCourseGroup: true
                                });
                                assignedTaskIds.add(taskToAssign.taskId);
                                markTempScheduled(rule.day, ruleStartMinutes, ruleEndMinutes, taskToAssign.facultyId, potentialRoom.id, groupIdentifier);
                                placedThisTask = true; break; 
                            }
                        }
                    }
                    if (!placedThisTask) {
                        chromosome.push({ taskId: taskToAssign.taskId, originalTask: taskToAssign, unassigned: true, isFixed: true, displayCourseGroup: true });
                        assignedTaskIds.add(taskToAssign.taskId); // Also add here to prevent random placement
                    }
                });
            });
            
            // --- PHASE 3: Place remaining (non-fixed) tasks randomly ---
            const remainingTasks = taskPool.filter(task => !assignedTaskIds.has(task.taskId));
            remainingTasks.forEach(task => {
                let assigned = false; let attempts = 0; const maxAttempts = (flatAvailableTimeSlots.length > 0 ? 100 : 1);
                const requiredDurationMinutes = task.duration * 60;
                while (!assigned && attempts < maxAttempts) {
                    if (flatAvailableTimeSlots.length === 0) { attempts = maxAttempts; break; }
                    const randomDaySlot = flatAvailableTimeSlots[Math.floor(Math.random() * flatAvailableTimeSlots.length)];
                    if (!randomDaySlot || !randomDaySlot.day || !randomDaySlot.startTime) { attempts++; continue; }
                    const slotStartMinutes = timeToMinutes(randomDaySlot.startTime);
                    const slotEndMinutes = slotStartMinutes + requiredDurationMinutes;
                    if (slotEndMinutes > collegeEndMinutes || slotStartMinutes < collegeStartMinutes) { attempts++; continue; } 
                    let isBreakOverlap = false;
                    const divisionForTask = allDivisionsInContext.find(d => d.id === task.divisionId);
                    if (divisionForTask) {
                        let breakStartM = -1, breakEndM = -1;
                        if (settings.useAlternateBreaks && settings.alternateBreakAssignments) {
                            const assignment = settings.alternateBreakAssignments.find(a => parseInt(a.divisionId) === divisionForTask.id);
                            if (assignment && assignment.breakStartTime) breakStartM = timeToMinutes(assignment.breakStartTime);
                            else if (settings.primaryBreakStartTime) breakStartM = timeToMinutes(settings.primaryBreakStartTime);
                        } else if (settings.primaryBreakStartTime) breakStartM = timeToMinutes(settings.primaryBreakStartTime);
                        if (breakStartM !== -1) breakEndM = breakStartM + 60;
                        if (breakStartM !== -1 && slotStartMinutes < breakEndM && slotEndMinutes > breakStartM) isBreakOverlap = true;
                    }
                    if(isBreakOverlap) {attempts++; continue;}
                    const studentCount = task.studentCount || (task.type === SlotCategory.Lab ? 20 : 60);
                    const suitableRooms = rooms.filter(r => 
                        r.capacity >= studentCount &&
                        ((task.type === SlotCategory.Lecture && r.category === 'Lecture') || 
                         (task.type === SlotCategory.Lab && r.category === 'Lab' && (task.labRequirements || []).every(req => (r.features || []).includes(req))))
                    );
                    if (suitableRooms.length > 0) {
                        const randomRoom = suitableRooms[Math.floor(Math.random() * suitableRooms.length)];
                        const groupIdentifier = task.isCustomLabGroup ? `customlab-${task.batchId}` : (task.batchId ? `batch-${task.batchId}` : `div-${task.divisionId}`);
                        const clashReason = checkTempClash(randomDaySlot.day, slotStartMinutes, slotEndMinutes, task.facultyId, randomRoom.id, groupIdentifier);
                        if (!clashReason) {
                            chromosome.push({
                                taskId: task.taskId, originalTask: task, day: randomDaySlot.day,
                                startTime: randomDaySlot.startTime, endTime: minutesToTime(slotEndMinutes),
                                roomId: randomRoom.id, facultyId: task.facultyId, divisionId: task.divisionId, batchId: task.batchId,
                                unassigned: false, isFixed: false, displayCourseGroup: false
                            });
                            assigned = true;
                            markTempScheduled(randomDaySlot.day, slotStartMinutes, slotEndMinutes, task.facultyId, randomRoom.id, groupIdentifier);
                        }
                    }
                    attempts++;
                }
                if (!assigned) {
                    chromosome.push({ taskId: task.taskId, originalTask: task, unassigned: true, isFixed: false, displayCourseGroup: false });
                }
            });
            return chromosome;
        };

        const calculateFitness = (chromosome) => {
            let fitness = 0;
            const scheduleGrid = {}; 
            const scheduledHoursPerTask = {};

            const unassignedCount = chromosome.filter(slot => slot.unassigned).length;
            fitness -= unassignedCount * PENALTY_UNASSIGNED_TASK;
            
            // Extra penalty for unassigned fixed tasks
            chromosome.forEach(slot => {
                if(slot.isFixed && slot.unassigned) {
                    fitness -= PENALTY_UNASSIGNED_TASK; // Double the standard unassigned penalty
                }
            });

            chromosome.forEach(slot => {
                if (slot.unassigned || !slot.day || !slot.startTime || !slot.roomId || !slot.originalTask) return;

                const task = slot.originalTask;
                const slotStartMinutes = timeToMinutes(slot.startTime);
                const slotEndMinutes = timeToMinutes(slot.endTime); 

                scheduledHoursPerTask[task.taskId] = (scheduledHoursPerTask[task.taskId] || 0) + task.duration;
                
                if (slotStartMinutes < collegeStartMinutes || slotEndMinutes > collegeEndMinutes) {
                    fitness -= PENALTY_COLLEGE_HOURS_VIOLATION;
                }

                const fixedRuleKey = `${task.type === SlotCategory.Lecture ? 'THEORY' : 'LAB'}-${task.subjectType}-${task.courseGroup}-${slot.day}-${slot.startTime}`;
                const designatedFixedRule = fixedSlotMap.get(fixedRuleKey);
                if (slot.isFixed) { 
                    if (!designatedFixedRule || slot.endTime !== designatedFixedRule.endTime ||
                        (designatedFixedRule.subjectNameHint && !task.subjectName.includes(designatedFixedRule.subjectNameHint) && !task.subjectCode.includes(designatedFixedRule.subjectNameHint))) {
                        // This condition might be triggered if a "Specific" slot clashes with a "Group" slot's definition
                        // which is less of a concern than it not being scheduled at all.
                        // We primarily rely on the initialization logic to get this right.
                    }
                } else { 
                    if (designatedFixedRule && designatedFixedRule.isMandatoryForAllDivisionsTakingGroup) {
                        fitness -= PENALTY_FIXED_SLOT_VIOLATION / 2; 
                    }
                }
                
                for (let t = slotStartMinutes; t < slotEndMinutes; t += 60) { 
                    if (eventBlockedSlots.has(`${slot.day}-${slot.roomId}-${t}`)) {
                        fitness -= PENALTY_EVENT_CLASH;
                    }
                }
                
                const room = rooms.find(r => r.id === slot.roomId);
                if (room && task) {
                    if (room.capacity < task.studentCount) { fitness -= PENALTY_ROOM_CAPACITY; }
                    if (task.type === SlotCategory.Lab && !(task.labRequirements || []).every(req => (room.features || []).includes(req))) {
                        fitness -= PENALTY_ROOM_FEATURE_MISMATCH;
                    }
                } else if (!room && slot.roomId) { fitness -= PENALTY_HARD_CONSTRAINT * 2; }
                
                if (settings.enableFloorPreferences && room && task && settings.floorPreferences) {
                    let preferredFloorsStr = settings.floorPreferences[task.type === SlotCategory.Lab ? 'Labs' : task.subjectType] || settings.floorPreferences.Common || "";
                    if (preferredFloorsStr) {
                        const preferredFloors = preferredFloorsStr.split(',').map(f => parseInt(f.trim())).filter(f => !isNaN(f));
                        if (preferredFloors.length > 0 && !preferredFloors.includes(room.floor)) {
                            fitness -= 50; 
                        }
                    }
                }
                
                let divisionBreakStartMins = -1, divisionBreakEndMins = -1;
                const divisionContext = allDivisionsInContext.find(d => d.id === task.divisionId);
                if (divisionContext) {
                    if (settings.useAlternateBreaks && settings.alternateBreakAssignments) {
                        const assignment = settings.alternateBreakAssignments.find(a => parseInt(a.divisionId) === divisionContext.id);
                        if (assignment && assignment.breakStartTime) { 
                            divisionBreakStartMins = timeToMinutes(assignment.breakStartTime);
                        } else if (settings.primaryBreakStartTime) { 
                            divisionBreakStartMins = timeToMinutes(settings.primaryBreakStartTime);
                        }
                    } else if (settings.primaryBreakStartTime) { 
                        divisionBreakStartMins = timeToMinutes(settings.primaryBreakStartTime);
                    }
                    if (divisionBreakStartMins !== -1) {
                        divisionBreakEndMins = divisionBreakStartMins + 60;
                        if (slotStartMinutes < divisionBreakEndMins && slotEndMinutes > divisionBreakStartMins) {
                            fitness -= PENALTY_BREAK_VIOLATION;
                        }
                    }
                }

                const facultyKeyPart = `faculty-${slot.facultyId}`;
                const roomKeyPart = `room-${slot.roomId}`;
                let groupKeyPart;
                let parentDivisionKeyPart = null;

                if (task.isCustomLabGroup) {
                    groupKeyPart = `customlab-${task.batchId}`;
                } else if (task.batchId) {
                    groupKeyPart = `batch-${task.batchId}`;
                    const batchDetails = allDivisionsInContext.flatMap(d => d.batches).find(b => b.id === task.batchId);
                    if (batchDetails && batchDetails.permanentDivisionId) {
                        parentDivisionKeyPart = `div-${batchDetails.permanentDivisionId}`;
                    }
                } else {
                    groupKeyPart = `div-${task.divisionId}`;
                }

                for (let t = slotStartMinutes; t < slotEndMinutes; t += 30) { 
                    const timeKeyBase = `${slot.day}-${t}`;
                    if (scheduleGrid[`${timeKeyBase}-${facultyKeyPart}`]) fitness -= PENALTY_HARD_CONSTRAINT; else scheduleGrid[`${timeKeyBase}-${facultyKeyPart}`] = 1;
                    if (scheduleGrid[`${timeKeyBase}-${roomKeyPart}`]) fitness -= PENALTY_HARD_CONSTRAINT; else scheduleGrid[`${timeKeyBase}-${roomKeyPart}`] = 1;
                    if (scheduleGrid[`${timeKeyBase}-${groupKeyPart}`]) fitness -= PENALTY_HARD_CONSTRAINT; else scheduleGrid[`${timeKeyBase}-${groupKeyPart}`] = 1;

                    if (parentDivisionKeyPart && scheduleGrid[`${timeKeyBase}-${parentDivisionKeyPart}`]) fitness -= PENALTY_HARD_CONSTRAINT; else if (parentDivisionKeyPart) scheduleGrid[`${timeKeyBase}-${parentDivisionKeyPart}`] = 1;
                }
            });

            const groupDaySubjectMap = {};
            chromosome.filter(s => !s.unassigned && s.originalTask).forEach(slot => {
                const task = slot.originalTask;
                const groupIdentifier = task.isCustomLabGroup ? `customlab-${task.batchId}` : (task.batchId ? `batch-${task.batchId}` : `div-${task.divisionId}`);
                const key = `${groupIdentifier}-${slot.day}`;
                if (!groupDaySubjectMap[key]) groupDaySubjectMap[key] = [];
                groupDaySubjectMap[key].push({ start: timeToMinutes(slot.startTime), end: timeToMinutes(slot.endTime), subjectId: task.subjectId, type: task.type });
            });
            for (const key in groupDaySubjectMap) {
                const daySlots = groupDaySubjectMap[key].sort((a, b) => a.start - b.start);
                for (let i = 0; i < daySlots.length - 1; i++) {
                    if (daySlots[i].end === daySlots[i+1].start && daySlots[i].subjectId === daySlots[i+1].subjectId && daySlots[i].type === daySlots[i+1].type) {
                       fitness -= PENALTY_BACK_TO_BACK_SAME_SUBJECT;
                    }
                }
            }
            
            tasksToSchedule.forEach(originalTaskDef => {
                if (!scheduledHoursPerTask[originalTaskDef.taskId] || scheduledHoursPerTask[originalTaskDef.taskId] < originalTaskDef.duration) {
                    fitness -= PENALTY_INCOMPLETE_HOURS; 
                }
            });
            return fitness;
        };
        
        const selection = (population) => { 
            const tournamentSize = Math.min(5, population.length);
            if (tournamentSize === 0 || population.length === 0) { 
                 const newChromo = initializeChromosome(); 
                 return { chromosome: newChromo, fitness: calculateFitness(newChromo) };
            }
            let bestInTournament = null;
            for (let i = 0; i < tournamentSize; i++) {
                const randomIndex = Math.floor(Math.random() * population.length);
                const contender = population[randomIndex];
                if (bestInTournament === null || (contender && contender.fitness > bestInTournament.fitness)) {
                    bestInTournament = contender;
                }
            }
            return bestInTournament || population[0] || { chromosome: initializeChromosome(), fitness: -Infinity };
        };

        const crossover = (parent1, parent2) => { 
            if (!parent1 || !parent1.chromosome || !parent2 || !parent2.chromosome) {
                return [ { chromosome: initializeChromosome(), fitness: 0 }, { chromosome: initializeChromosome(), fitness: 0 } ];
            }
            const p1Chromo = parent1.chromosome; const p2Chromo = parent2.chromosome;
            const offspring1Chromosome = []; const offspring2Chromosome = [];
            const taskMap1 = new Map(); p1Chromo.forEach(slot => { if(slot && slot.taskId) taskMap1.set(slot.taskId, slot); });
            const taskMap2 = new Map(); p2Chromo.forEach(slot => { if(slot && slot.taskId) taskMap2.set(slot.taskId, slot); });
            tasksToSchedule.forEach(taskDefinition => {
                const slot1 = taskMap1.get(taskDefinition.taskId) || { taskId: taskDefinition.taskId, originalTask: taskDefinition, unassigned: true, isFixed: false, displayCourseGroup: false };
                const slot2 = taskMap2.get(taskDefinition.taskId) || { taskId: taskDefinition.taskId, originalTask: taskDefinition, unassigned: true, isFixed: false, displayCourseGroup: false };
                if (slot1.isFixed && slot1.unassigned === false) { 
                    offspring1Chromosome.push({...slot1}); offspring2Chromosome.push({...slot1}); 
                } else if (slot2.isFixed && slot2.unassigned === false) {
                    offspring1Chromosome.push({...slot2}); offspring2Chromosome.push({...slot2});
                } else { 
                    if (Math.random() < 0.5) { offspring1Chromosome.push({...slot1}); offspring2Chromosome.push({...slot2}); } 
                    else { offspring1Chromosome.push({...slot2}); offspring2Chromosome.push({...slot1}); }
                }
            });
            return [{ chromosome: offspring1Chromosome, fitness: 0 }, { chromosome: offspring2Chromosome, fitness: 0 }];
        };
        
        const mutate = (individual) => { 
            if (!individual || !individual.chromosome) { return { chromosome: initializeChromosome(), fitness: 0 }; }
            let chromosome = JSON.parse(JSON.stringify(individual.chromosome)); 
            for (let i = 0; i < chromosome.length; i++) {
                if (!chromosome[i] || chromosome[i].isFixed || !chromosome[i].originalTask) continue; 
                if (Math.random() < GA_MUTATION_RATE) {
                    const taskToReschedule = chromosome[i].originalTask;
                    let mutated = false; let attempts = 0; const maxMutationAttempts = (flatAvailableTimeSlots.length > 0 ? 30 : 1);
                    while(!mutated && attempts < maxMutationAttempts) {
                        if(flatAvailableTimeSlots.length === 0) {attempts = maxMutationAttempts; break;}
                        const randomDaySlot = flatAvailableTimeSlots[Math.floor(Math.random() * flatAvailableTimeSlots.length)];
                        if (!randomDaySlot || !randomDaySlot.day || !randomDaySlot.startTime) { attempts++; continue; }
                        const slotStartMinutes = timeToMinutes(randomDaySlot.startTime);
                        const slotEndMinutes = slotStartMinutes + taskToReschedule.duration * 60;
                        if (slotEndMinutes > collegeEndMinutes || slotStartMinutes < collegeStartMinutes) { attempts++; continue; }
                        const studentCount = taskToReschedule.studentCount || (taskToReschedule.type === SlotCategory.Lab ? 20 : 60);
                        const suitableRooms = rooms.filter(r => r.capacity >= studentCount &&
                            ((taskToReschedule.type === SlotCategory.Lecture && r.category === 'Lecture') || 
                            (taskToReschedule.type === SlotCategory.Lab && r.category === 'Lab' && (taskToReschedule.labRequirements || []).every(req => (r.features||[]).includes(req))))
                        );
                        if (suitableRooms.length > 0) {
                            const randomRoom = suitableRooms[Math.floor(Math.random() * suitableRooms.length)];
                            let eventClash = false;
                            for (let t_event = slotStartMinutes; t_event < slotEndMinutes; t_event += 60) {
                                if (eventBlockedSlots.has(`${randomDaySlot.day}-${randomRoom.id}-${t_event}`)) { eventClash = true; break; }
                            }
                            if (eventClash) { attempts++; continue; }
                            chromosome[i] = { ...chromosome[i], day: randomDaySlot.day, startTime: randomDaySlot.startTime,
                                endTime: minutesToTime(slotEndMinutes), roomId: randomRoom.id, unassigned: false };
                            mutated = true;
                        }
                        attempts++;
                    }
                    if (!mutated) { 
                        chromosome[i].unassigned = true; 
                        chromosome[i].day = null; chromosome[i].startTime = null; chromosome[i].endTime = null; chromosome[i].roomId = null;
                    }
                }
            }
            return { chromosome: chromosome, fitness: 0 }; 
        };

        // --- GA Main Loop ---
        let population = [];
        for (let i = 0; i < GA_POPULATION_SIZE; i++) {
            const chromoInstance = initializeChromosome();
            population.push({ chromosome: chromoInstance, fitness: calculateFitness(chromoInstance) });
        }
        population.sort((a, b) => b.fitness - a.fitness); 
        console.log(`[GA Backend] Initial Population (Size ${GA_POPULATION_SIZE}). Best initial fitness: ${population[0]?.fitness ?? 'N/A'}. Num unassigned in best: ${population[0]?.chromosome.filter(s=>s.unassigned).length ?? 'N/A'}`);

        for (let gen = 0; gen < GA_MAX_GENERATIONS; gen++) {
            let newPopulation = [];
            for (let i = 0; i < GA_ELITISM_COUNT && i < population.length; i++) { if(population[i]) newPopulation.push(population[i]); }
            while (newPopulation.length < GA_POPULATION_SIZE) {
                const parent1 = selection(population); const parent2 = selection(population);
                let offspringPair;
                if (parent1 && parent2 && Math.random() < GA_CROSSOVER_RATE) { offspringPair = crossover(parent1, parent2); } 
                else { 
                    offspringPair = [ 
                        parent1 ? JSON.parse(JSON.stringify(parent1)) : { chromosome: initializeChromosome(), fitness: -Infinity },
                        parent2 ? JSON.parse(JSON.stringify(parent2)) : { chromosome: initializeChromosome(), fitness: -Infinity } 
                    ];
                    if(parent1) offspringPair[0].fitness = parent1.fitness; if(parent2) offspringPair[1].fitness = parent2.fitness;
                }
                offspringPair.forEach(off => {
                    if (off && off.chromosome) { const mutatedOffspring = mutate(off); mutatedOffspring.fitness = calculateFitness(mutatedOffspring.chromosome); newPopulation.push(mutatedOffspring); } 
                    else { const reinitialized = initializeChromosome(); newPopulation.push({chromosome: reinitialized, fitness: calculateFitness(reinitialized)}); }
                });
            }
            if (newPopulation.length > 0) { population = newPopulation.slice(0, GA_POPULATION_SIZE).sort((a, b) => b.fitness - a.fitness); } 
            else { 
                console.warn(`[GA Loop] New population empty at gen ${gen}. Reinitializing.`);
                population = []; for (let i = 0; i < GA_POPULATION_SIZE; i++) { const chromo = initializeChromosome(); population.push({ chromosome: chromo, fitness: calculateFitness(chromo) });} population.sort((a,b) => b.fitness - a.fitness);
            }
            if ((gen + 1) % Math.max(1, Math.floor(GA_MAX_GENERATIONS / 10)) === 0 || gen === GA_MAX_GENERATIONS - 1) {
                if (population.length > 0 && population[0]) { 
                    const bestChromoOfGen = population[0];
                    const unassignedInBest = bestChromoOfGen.chromosome.filter(s => s.unassigned).length;
                    console.log(`[GA Backend] Gen ${gen + 1}/${GA_MAX_GENERATIONS}: Best Fitness = ${bestChromoOfGen.fitness}. Unassigned in best: ${unassignedInBest}/${tasksToSchedule.length}`); 
                } else { console.log(`[GA Backend] Gen ${gen + 1}/${GA_MAX_GENERATIONS}: Population empty or invalid.`); }
            }
        }
        
        let bestChromosome = (population[0]?.chromosome && population[0].chromosome.length > 0) ? population[0].chromosome : initializeChromosome();
        const bestFitness = population[0]?.fitness ?? calculateFitness(bestChromosome);

        console.log("[GA Backend] Formatting final timetable slots...");
        const finalTimetableSlots = [];
        const taskDetailsMap = new Map(tasksToSchedule.map(t => [t.taskId, t]));

        bestChromosome.filter(slot => !slot.unassigned && slot.day && slot.startTime && slot.roomId && slot.originalTask).forEach(slot => {
            const originalTaskDetails = taskDetailsMap.get(slot.originalTask.taskId) || slot.originalTask; 
            const roomInfo = rooms.find(r => r.id === slot.roomId);
            const facultyInfo = facultyMembers.find(f => f.id === slot.facultyId);
            const divisionInfo = allDivisionsInContext.find(d => d.id === originalTaskDetails.divisionId);
            let batchInfo = null;
            if (originalTaskDetails.batchId) {
                if (originalTaskDetails.isCustomLabGroup) {
                    const customBatch = customLabGroupSets.flatMap(cs => cs.customLabBatches).find(clb => clb.id === originalTaskDetails.batchId);
                    if(customBatch) batchInfo = { name: customBatch.name, id: customBatch.id };
                } else {
                    batchInfo = allDivisionsInContext.flatMap(d => d.batches).find(b => b.id === originalTaskDetails.batchId) || 
                                allDivisionsInContext.flatMap(d => d.composedOfPermanentBatches || []).find(b => b.id === originalTaskDetails.batchId);
                }
            }
            finalTimetableSlots.push({
                ...slot, 
                originalTask: originalTaskDetails, 
                subjectName: originalTaskDetails.subjectName, subjectCode: originalTaskDetails.subjectCode,
                facultyName: facultyInfo ? facultyInfo.name : 'N/A', roomNumber: roomInfo ? roomInfo.roomNumber : 'N/A',
                divisionName: divisionInfo ? divisionInfo.name : originalTaskDetails.divisionName, 
                batchName: batchInfo ? batchInfo.name : originalTaskDetails.batchName, 
                slotCategory: originalTaskDetails.type, dayOfWeek: slot.day 
            });
        });
        
        fixedSlotMap.forEach((rule, ruleKey) => {
            if (rule.isMandatoryForAllDivisionsTakingGroup) {
                commonPermanentDivisions.forEach(commonDiv => {
                    const alreadyExists = finalTimetableSlots.some(s => 
                        s.dayOfWeek === rule.day && s.startTime === rule.startTime && s.originalTask?.divisionId === commonDiv.id &&
                        s.originalTask?.courseGroup === rule.courseGroup && s.originalTask?.subjectType === rule.subjectType &&
                        !s.originalTask?.taskId?.startsWith('DISPLAY_')
                    );

                    if (!alreadyExists) {
                        finalTimetableSlots.push({
                            taskId: `DISPLAY_${rule.type}_${rule.courseGroup}_${commonDiv.id}_${rule.day}_${rule.startTime}`,
                            originalTask: { 
                                taskId: `DISPLAY_${rule.type}_${rule.courseGroup}_${commonDiv.id}_${rule.day}_${rule.startTime}`,
                                type: rule.type, subjectType: rule.subjectType, courseGroup: rule.courseGroup,
                                subjectName: `${rule.courseGroup} (${rule.subjectType})`,
                                subjectCode: rule.subjectType.toString(), 
                                divisionId: commonDiv.id, divisionName: commonDiv.name,
                                isFixed: true, displayCourseGroup: true, 
                            },
                            day: rule.day, dayOfWeek: rule.day, startTime: rule.startTime, endTime: rule.endTime,
                            roomId: null, roomNumber: "Multiple/TBD",
                            facultyId: null, facultyName: "Multiple/TBD",
                            divisionId: commonDiv.id, divisionName: commonDiv.name, batchId: null, batchName: null,
                            unassigned: false, isFixed: true, displayCourseGroup: true,
                            slotCategory: rule.type, 
                        });
                    }
                });
            }
        });
        
        scheduledEvents.forEach(event => { 
            event.eventTimings.forEach(et => {
                const dayOfWeekForEventSlot = et.dayOfWeek; 
                if (!dayOfWeekEnumValues.includes(dayOfWeekForEventSlot)) { 
                    console.warn(`[GA FinalFormat] Invalid dayOfWeek '${dayOfWeekForEventSlot}' for event ID ${event.id}. Skipping.`); return;
                }
                let roomNumberDisplay = "General Event"; 
                let firstRoomId = null;
                const allRoomNrs = event.assignedRooms?.map(r => r.roomNumber) || [];
                const allRIds = event.assignedRooms?.map(r => r.id) || [];

                if (event.assignedRooms && event.assignedRooms.length > 0) {
                    roomNumberDisplay = allRoomNrs.join(', ');
                    firstRoomId = allRIds[0];
                }
                finalTimetableSlots.push({
                    dayOfWeek: dayOfWeekForEventSlot, startTime: et.startTime, endTime: et.endTime,
                    slotCategory: SlotCategory.Event_Scheduled, roomId: firstRoomId, roomNumber: roomNumberDisplay,
                    originalTask: { 
                        taskId: `EVENT_${event.id}_${dayOfWeekForEventSlot}_${et.startTime}`, 
                        subjectName: event.title, subjectCode: "EVENT", type: SlotCategory.Event_Scheduled, 
                        eventDepartmentId: event.departmentId, description: event.description, isFixed: true,
                        allRoomNumbers: allRoomNrs, 
                        allRoomIds: allRIds, 
                    },
                    unassigned: false, isFixed: true, displayCourseGroup: false
                });
            });
        });

        // --- NEW: Advanced Diagnostic Logic for Unassigned Tasks ---
        console.log("[GA Backend] Running diagnostics on unassigned tasks...");
        const unassignedSlots = bestChromosome.filter(slot => slot.unassigned);
        const unassignedTaskDetails = [];

        // Create a lookup grid of the final scheduled timetable for efficient checking
        const finalScheduleGrid = {};
        finalTimetableSlots.forEach(slot => {
            if (!slot.originalTask || !slot.dayOfWeek || !slot.startTime) return;
            const startMins = timeToMinutes(slot.startTime);
            const endMins = timeToMinutes(slot.endTime);
            for (let t = startMins; t < endMins; t += 30) { // 30-min precision
                const keyBase = `${slot.dayOfWeek}-${t}`;
                if (slot.facultyId) finalScheduleGrid[`${keyBase}-faculty-${slot.facultyId}`] = true;
                if (slot.roomId) finalScheduleGrid[`${keyBase}-room-${slot.roomId}`] = true;
                // For student groups, mark both batch and division as busy
                if (slot.batchId) finalScheduleGrid[`${keyBase}-batch-${slot.batchId}`] = true;
                if (slot.divisionId) finalScheduleGrid[`${keyBase}-division-${slot.divisionId}`] = true;
            }
        });

        for (const unassigned of unassignedSlots) {
            const task = unassigned.originalTask;
            let conflictReasons = { faculty: 0, student: 0, room: 0, event: 0 };
            let totalSlotsChecked = 0;

            // Iterate over every possible time slot to check for conflicts
            for (const day of activeDaysForSlotGen) {
                for (const startTime of timeSlotsPerHour[day]) {
                    const startMins = timeToMinutes(startTime);
                    const endMins = startMins + task.duration * 60;

                    if (endMins > collegeEndMinutes) continue;
                    totalSlotsChecked++;

                    let isFacultyBusy = false;
                    let isStudentBusy = false;

                    // Check for conflicts in 30-min intervals
                    for (let t = startMins; t < endMins; t += 30) {
                        const keyBase = `${day}-${t}`;
                        if (finalScheduleGrid[`${keyBase}-faculty-${task.facultyId}`]) isFacultyBusy = true;
                        
                        const studentGroupKey = task.batchId ? `batch-${task.batchId}` : `division-${task.divisionId}`;
                        if (finalScheduleGrid[`${keyBase}-${studentGroupKey}`]) isStudentBusy = true;
                    }
                    
                    if (isFacultyBusy) conflictReasons.faculty++;
                    if (isStudentBusy) conflictReasons.student++;

                    // Check for room availability
                    const requiredRoomType = task.type === SlotCategory.Lab ? 'Lab' : 'Lecture';
                    const suitableRooms = rooms.filter(r => 
                        r.category === requiredRoomType && 
                        r.capacity >= task.studentCount &&
                        (task.labRequirements || []).every(req => (r.features || []).includes(req))
                    );
                    
                    const availableRooms = suitableRooms.filter(r => {
                        for (let t = startMins; t < endMins; t += 30) {
                            if (finalScheduleGrid[`${day}-${t}-room-${r.id}`]) return false; // Room is busy
                        }
                        // Check for event clashes in the room
                        for (let t_event = startMins; t_event < endMins; t_event += 60) {
                            if (eventBlockedSlots.has(`${day}-${r.id}-${t_event}`)) return false;
                        }
                        return true;
                    });

                    if (availableRooms.length === 0) {
                        conflictReasons.room++;
                    }
                }
            }
            
            // Determine the final reason based on conflict counts
            let finalReason = "Could not be scheduled due to optimization constraints.";
            if (totalSlotsChecked > 0) {
                const facultyConflictRatio = conflictReasons.faculty / totalSlotsChecked;
                const studentConflictRatio = conflictReasons.student / totalSlotsChecked;
                const roomConflictRatio = conflictReasons.room / totalSlotsChecked;

                if (facultyConflictRatio > 0.8) {
                    finalReason = `Persistent Faculty Conflict: ${task.facultyName} is unavailable in over 80% of the valid time slots.`;
                } else if (studentConflictRatio > 0.8) {
                    const groupName = task.batchName || task.divisionName;
                    finalReason = `Persistent Student Conflict: The group '${groupName}' is unavailable in over 80% of the valid time slots.`;
                } else if (roomConflictRatio > 0.8) {
                    finalReason = `Persistent Room Conflict: No suitable rooms were available in over 80% of the valid time slots.`;
                } else {
                    finalReason = `Multiple Conflicts: No single slot was free of clashes with faculty, student groups, and available rooms.`;
                }
            }
            unassignedTaskDetails.push({ ...task, reason: finalReason });
        }
        
        const scheduledAcademicTasksCount = finalTimetableSlots.filter(s => 
            s.slotCategory !== SlotCategory.Event_Scheduled && 
            s.originalTask && !s.unassigned && 
            !s.originalTask.taskId?.startsWith('DISPLAY_') 
        ).length;

        console.log(`[GA Backend] Final Best Fitness: ${bestFitness}. Scheduled ${scheduledAcademicTasksCount} of ${tasksToSchedule.length} academic tasks. Unassigned: ${unassignedTaskDetails.length}`);
        if (unassignedTaskDetails.length > 0) {
            console.warn(`[GA Backend] Sample Unassigned tasks (max 10 shown):`, unassignedTaskDetails.slice(0, 10).map(t => `ID: ${t.taskId}, Sub: ${t.subjectCode}, Reason: ${t.reason}`));
        }
        
        const divisionsForFrontend = allDivisionsInContext.map(div => ({
            ...div,
            composedOfPermanentBatches: (div.composedOfPermanentBatches || []).map(pb => ({
                ...pb,
                permanentDivisionName: pb.permanentDivision?.name || 'N/A'
            }))
        }));
        const customLabBatchesForFrontend = customLabGroupSets.flatMap(cs => 
            (cs.customLabBatches || []).map(clb => ({
                ...clb,
                composedOfPermanentBatches: (clb.composedOfPermanentBatches || []).map(pb => ({
                    ...pb,
                    permanentDivisionName: pb.permanentDivision?.name || 'N/A'
                }))
            }))
        );
        
        const fetchedDataSummary = { 
            subjectsData: subjects, 
            facultyData: facultyMembers, 
            roomData: rooms, 
            divisionsData: divisionsForFrontend, 
            customLabBatches: customLabBatchesForFrontend 
        };

        res.status(200).json({
            message: `Timetable generation complete. Best fitness: ${bestFitness}. Scheduled ${scheduledAcademicTasksCount}/${tasksToSchedule.length} academic tasks. ${unassignedTaskDetails.length > 0 ? `${unassignedTaskDetails.length} tasks unassigned.` : ''} Review if needed.`,
            timetable: finalTimetableSlots,
            fetchedDataSummary,
            unassignedTaskCount: unassignedTaskDetails.length,
            unassignedTaskDetails: unassignedTaskDetails // This now contains the diagnostic reasons
        });

    } catch (error) {
        console.error("[GA Backend Timetable Generation Error]:", error);
        res.status(500).json({ message: error.message || 'An unexpected error occurred during timetable generation.' });
        next(error); 
    }
});


// --- Route to Save Generated Timetable Slots ---
router.post('/save-slots', authorize('Admin'), async (req, res, next) => {
    const { departmentId, year, semesterType, slots, academicSessionStartYear } = req.body;
    if (!departmentId || !year || !semesterType || !academicSessionStartYear || !Array.isArray(slots)) {
        return res.status(400).json({ message: "Department, year, semester type, academic session start year, and slots array are required." });
    }
    const calculatedSemester = calculateSemesterNumberInternal(year, semesterType);
    if (!calculatedSemester) return res.status(400).json({ message: "Invalid year or semester type." });

    const deptIdInt = parseInt(departmentId);
    const yearInt = parseInt(year);
    const academicSessionStartYearInt = parseInt(academicSessionStartYear);
    const dayOfWeekEnumValuesList = Object.values(DayOfWeek); 

    try {
        await prisma.$transaction(async (tx) => {
            const divisionsInContext = await tx.division.findMany({
                where: { departmentId: deptIdInt, year: yearInt, semester: calculatedSemester },
                select: { id: true, batches: { select: { id: true } } }
            });
            const divisionIdsInContext = divisionsInContext.map(d => d.id);
            const batchIdsInContext = divisionsInContext.flatMap(d => d.batches.map(b => b.id));
            
            if (divisionIdsInContext.length > 0) {
                await tx.timetableSlot.deleteMany({
                    where: {
                        academicSessionStartYear: academicSessionStartYearInt,
                        OR: [ { divisionId: { in: divisionIdsInContext } }, { batchId: { in: batchIdsInContext } }, ],
                        slotCategory: { not: SlotCategory.Event_Scheduled } 
                    }
                });
            } else { console.warn(`[Save Timetable] No divisions for context. No slots deleted.`); }
            
            const slotDataToCreate = slots.map(slot => {
                if (!slot || slot.slotCategory === SlotCategory.Event_Scheduled || 
                    slot.originalTask?.taskId?.startsWith('DISPLAY_') || 
                    !slot.originalTask || slot.unassigned) return null;
                
                const task = slot.originalTask;
                if (task.divisionId === undefined || task.divisionId === null) { console.error("Skipping save: missing originalTask.divisionId:", slot); return null; }
                const dayStringFromSlot = slot.dayOfWeek; 
                if (!dayOfWeekEnumValuesList.includes(dayStringFromSlot)) { console.error("Skipping save: invalid dayOfWeek:", dayStringFromSlot, slot); return null;  }
                if (!Object.values(SlotCategory).includes(slot.slotCategory) || slot.slotCategory === SlotCategory.Event_Scheduled) {  console.error("Skipping save: invalid/event slotCategory:", slot.slotCategory, slot); return null;  }
                
                return {
                    dayOfWeek: dayStringFromSlot, startTime: slot.startTime, endTime: slot.endTime,
                    slotCategory: slot.slotCategory, academicSessionStartYear: academicSessionStartYearInt,
                    divisionId: parseInt(task.divisionId), roomId: slot.roomId ? parseInt(slot.roomId) : null,
                    subjectId: task.subjectId ? parseInt(task.subjectId) : null,
                    facultyId: task.facultyId ? parseInt(task.facultyId) : null,
                    batchId: (task.batchId && !task.isCustomLabGroup) ? parseInt(task.batchId) : null,
                };
            }).filter(Boolean);

            if (slotDataToCreate.length > 0) {
                const creationResult = await tx.timetableSlot.createMany({ data: slotDataToCreate, skipDuplicates: true });
                res.status(201).json({ message: `Timetable saved successfully. ${creationResult.count} academic slots created/updated.` });
            } else {
                res.status(200).json({ message: "No valid academic slots provided to save." });
            }
        });
    } catch (error) { 
        console.error("Error saving timetable slots:", error); 
        if (error.code === 'P2003' && error.meta?.field_name) { 
            return res.status(400).json({ message: `Save failed: Invalid reference ID for field '${error.meta.field_name}'. Ensure entities exist.` }); 
        } else if (error.code === 'P2002') { 
            return res.status(400).json({ message: `Save failed: Unique constraint violated. Details: ${error.meta?.target}`}); 
        } 
        next(error); 
    }
});

export default router;