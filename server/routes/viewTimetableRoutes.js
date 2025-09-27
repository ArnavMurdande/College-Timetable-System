// File: server/routes/viewTimetableRoutes.js

import express from 'express';
import { PrismaClient, DayOfWeek, SlotCategory } from '@prisma/client';
import { protect } from '../middleware/authMiddleware.js';

const prisma = new PrismaClient();
const router = express.Router();

// Helper to calculate semester number
const calculateSemesterNumberInternal = (year, semesterType) => {
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) return null;
    const semTypeLower = String(semesterType).toLowerCase();
    if (semTypeLower === 'odd') return yearNum * 2 - 1;
    if (semTypeLower === 'even') return yearNum * 2;
    return null;
};

// All routes in this file are protected
router.use(protect);

// GET /api/view-timetable/
// Fetches saved timetable slots and related data for display
router.get('/', async (req, res, next) => {
    const { departmentId, year, semesterType, academicSessionStartYear } = req.query;

    if (!departmentId || !year || !semesterType || !academicSessionStartYear) {
        return res.status(400).json({ message: "Department, Year, Semester Type, and Academic Session are required." });
    }

    const calculatedSemester = calculateSemesterNumberInternal(year, semesterType);
    if (!calculatedSemester) {
        return res.status(400).json({ message: "Invalid Year or Semester Type provided." });
    }
    
    const deptIdNum = parseInt(departmentId);
    const yearNum = parseInt(year);
    const academicSessionStartYearNum = parseInt(academicSessionStartYear);

    try {
        // 1. Fetch saved timetable slots based on the primary filters
        const savedSlots = await prisma.timetableSlot.findMany({
            where: {
                academicSessionStartYear: academicSessionStartYearNum,
                division: {
                    departmentId: deptIdNum,
                    year: yearNum,
                    semester: calculatedSemester,
                },
                slotCategory: { not: SlotCategory.Event_Scheduled } // Exclude events as they are fetched separately
            },
            include: {
                subject: true,
                faculty: true,
                room: true,
                division: true,
                batch: true,
            }
        });

        // 2. Fetch all weekly events relevant to this department or college-wide
        const scheduledEvents = await prisma.event.findMany({
            where: {
                frequency: 'WEEKLY',
                OR: [
                    { departmentId: deptIdNum },
                    { departmentId: null }
                ],
            },
            include: {
                eventTimings: true,
                assignedRooms: { select: { id: true, roomNumber: true } }
            }
        });

        // 3. Get all supporting data needed for the display filters (faculty, rooms, divisions)
        const divisionsInContext = await prisma.division.findMany({
            where: { departmentId: deptIdNum, year: yearNum, semester: calculatedSemester },
            include: { batches: true }
        });

        const facultyInDept = await prisma.faculty.findMany({
            where: { departmentId: deptIdNum },
            select: { id: true, name: true, uniqueId: true }
        });
        
        const roomsInDept = await prisma.room.findMany({
            where: { OR: [{ departmentId: deptIdNum }, { departmentId: null }] },
            select: { id: true, roomNumber: true, category: true }
        });

        // 4. Format the fetched data to match the structure expected by TimetableGrid
        const formattedSlots = savedSlots.map(slot => ({
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            slotCategory: slot.slotCategory,
            roomId: slot.roomId,
            roomNumber: slot.room?.roomNumber,
            facultyId: slot.facultyId,
            facultyName: slot.faculty?.name,
            divisionId: slot.divisionId,
            divisionName: slot.division?.name,
            batchId: slot.batchId,
            batchName: slot.batch?.name,
            subjectId: slot.subjectId,
            subjectName: slot.subject?.name,
            subjectCode: slot.subject?.code,
            originalTask: { // Mimic structure from GA for consistency in TimetableGrid
                taskId: `DB_SLOT_${slot.id}`,
                type: slot.slotCategory,
                subjectId: slot.subjectId,
                subjectName: slot.subject?.name,
                subjectCode: slot.subject?.code,
                subjectType: slot.subject?.subjectType,
                courseGroup: slot.subject?.courseGroup,
                facultyId: slot.facultyId,
                facultyName: slot.faculty?.name,
                divisionId: slot.divisionId,
                divisionName: slot.division?.name,
                batchId: slot.batchId,
                batchName: slot.batch?.name,
                isFixed: false, // Saved slots are not considered fixed in the context of GA editing
                displayCourseGroup: false,
            }
        }));

        // Add formatted events to the slots array
        scheduledEvents.forEach(event => {
            event.eventTimings.forEach(et => {
                 let roomNumberDisplay = "General Event";
                 let firstRoomId = null;
                 const allRoomNrs = event.assignedRooms?.map(r => r.roomNumber) || [];
                 const allRIds = event.assignedRooms?.map(r => r.id) || [];

                 if (event.assignedRooms && event.assignedRooms.length > 0) {
                     roomNumberDisplay = allRoomNrs.join(', ');
                     firstRoomId = allRIds[0];
                 }
                formattedSlots.push({
                    dayOfWeek: et.dayOfWeek, startTime: et.startTime, endTime: et.endTime,
                    slotCategory: SlotCategory.Event_Scheduled, roomId: firstRoomId, roomNumber: roomNumberDisplay,
                    originalTask: { 
                        taskId: `EVENT_${event.id}_${et.dayOfWeek}_${et.startTime}`, 
                        subjectName: event.title, subjectCode: "EVENT", type: SlotCategory.Event_Scheduled, 
                        eventDepartmentId: event.departmentId, description: event.description, isFixed: true,
                        allRoomNumbers: allRoomNrs, allRoomIds: allRIds, 
                    },
                    unassigned: false, isFixed: true, displayCourseGroup: false
                });
            });
        });

        res.status(200).json({
            timetable: formattedSlots,
            displayData: {
                divisions: divisionsInContext,
                faculty: facultyInDept,
                rooms: roomsInDept,
            }
        });

    } catch (error) {
        console.error("Error fetching saved timetable:", error);
        next(error);
    }
});

export default router;
