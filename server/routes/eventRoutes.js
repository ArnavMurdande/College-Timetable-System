// File: server/routes/eventRoutes.js

import express from 'express';
import { PrismaClient, EventFrequency, DayOfWeek, UserRole } from '@prisma/client';
import { protect, authorize } from '../middleware/authMiddleware.js';

const prisma = new PrismaClient();
const router = express.Router();

router.use(protect);

const timeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

// --- GET /api/events/my-reminders - Fetch upcoming reminders for the logged-in user ---
// Access: Any logged-in user 
router.get('/my-reminders', async (req, res, next) => { 
    const userId = req.user.id;
    const serverNow = new Date(); 
    
    console.log(`[Server /my-reminders] User ID: ${userId}`);
    console.log(`[Server /my-reminders] Server's current UTC time: ${serverNow.toISOString()}`);
    console.log(`[Server /my-reminders] Server's current local time (for reference): ${serverNow.toLocaleString()}`);

    try {
        const remindersFromDB = await prisma.event.findMany({
            where: {
                createdByUserId: userId, 
                reminderEnabled: true,
                reminderDateTime: {
                    gte: serverNow, 
                },
            },
            select: { 
                id: true,
                title: true,
                reminderEnabled: true, 
                reminderDateTime: true,
                eventTimings: { 
                    take: 1, // Still take 1 for brevity in notification, could take all if needed
                    select: { dayOfWeek: true, startTime: true, endTime: true, specificDate: true },
                    orderBy: { specificDate: 'asc' } 
                },
                assignedRooms: { // MODIFIED: Removed take: 1 to fetch all assigned rooms
                    select: { id: true, roomNumber: true, category: true, features: true } // Added id and features
                }
            },
            orderBy: {
                reminderDateTime: 'asc',
            },
            take: 10, 
        });
        
        console.log(`[Server /my-reminders] Found ${remindersFromDB.length} raw reminders from DB for user ${userId} where reminderDateTime >= ${serverNow.toISOString()}:`);
        remindersFromDB.forEach(r => {
            console.log(`  Event ID: ${r.id}, Title: "${r.title}", ReminderDateTime (UTC): ${r.reminderDateTime?.toISOString()}, Rooms: ${r.assignedRooms.map(room => room.roomNumber).join(', ')}`);
        });

        res.status(200).json(remindersFromDB);
    } catch (error) {
        console.error("[Server /my-reminders] Fetch My Reminders Error:", error);
        next(error);
    }
});


// --- POST /api/events - Create a new event ---
// Access: Admin Only
router.post('/', authorize(UserRole.Admin), async (req, res, next) => {
    const {
        title, description, frequency, departmentId,
        assignedRoomIds, 
        eventTimings 
    } = req.body;
    const createdByUserId = req.user.id;

    if (!title || !frequency || !eventTimings || !Array.isArray(eventTimings) || eventTimings.length === 0) {
        return res.status(400).json({ message: 'Title, frequency, and at least one event timing are required.' });
    }
    if (!Object.values(EventFrequency).includes(frequency)) {
        return res.status(400).json({ message: 'Invalid event frequency.' });
    }
    for (const timing of eventTimings) {
        if (!timing.dayOfWeek || !timing.startTime || !timing.endTime) {
            return res.status(400).json({ message: 'Each event timing must have dayOfWeek, startTime, and endTime.' });
        }
        if (!Object.values(DayOfWeek).includes(timing.dayOfWeek)) {
            return res.status(400).json({ message: `Invalid dayOfWeek: ${timing.dayOfWeek}` });
        }
        if (timeToMinutes(timing.startTime) >= timeToMinutes(timing.endTime)) {
            return res.status(400).json({ message: `Event end time must be after start time for ${timing.dayOfWeek} ${timing.startTime}.` });
        }
        if (frequency === EventFrequency.ONCE && !timing.specificDate) {
            return res.status(400).json({ message: `Specific date is required for ONCE event timings.` });
        }
    }
    if (assignedRoomIds && !Array.isArray(assignedRoomIds)) {
        return res.status(400).json({ message: 'assignedRoomIds must be an array of room IDs.' });
    }

    try {
        const eventData = {
            title,
            description,
            frequency,
            departmentId: departmentId ? parseInt(departmentId) : null,
            createdByUserId,
            eventTimings: {
                create: eventTimings.map(et => ({
                    dayOfWeek: et.dayOfWeek,
                    startTime: et.startTime,
                    endTime: et.endTime,
                    specificDate: frequency === EventFrequency.ONCE && et.specificDate ? new Date(et.specificDate) : null,
                })),
            },
            assignedRooms: assignedRoomIds && assignedRoomIds.length > 0 
                ? { connect: assignedRoomIds.map(id => ({ id: parseInt(id) })) } 
                : undefined,
        };

        const newEvent = await prisma.event.create({
            data: eventData,
            include: {
                eventTimings: true,
                department: true,
                assignedRooms: { select: { id: true, roomNumber: true, category: true, features: true } },
                createdByUser: { select: { id: true, email: true, role: true } },
            },
        });
        res.status(201).json(newEvent);
    } catch (error) {
        console.error("Create Event Error:", error);
        if (error.code === 'P2002') { 
            return res.status(409).json({ message: 'An event with similar details might already exist.' });
        }
        if (error.code === 'P2025' && error.message.includes('Room')) {
            return res.status(400).json({ message: 'One or more assigned room IDs are invalid.' });
        }
        next(error);
    }
});

// --- GET /api/events - Get all events (with filtering) ---
// Access: Admin, Faculty, User
router.get('/', authorize(UserRole.Admin, UserRole.Faculty, UserRole.User), async (req, res, next) => {
    const { departmentId, frequency, dayOfWeek, roomId, startDate, endDate } = req.query; 
    const whereClause = {};
    const eventTimingsWhere = {};

    if (departmentId) whereClause.departmentId = parseInt(departmentId);
    if (frequency) whereClause.frequency = frequency;
    if (roomId) whereClause.assignedRooms = { some: { id: parseInt(roomId) } };

    if (dayOfWeek) eventTimingsWhere.dayOfWeek = dayOfWeek;
    if (startDate) {
        eventTimingsWhere.OR = [
            { specificDate: { gte: new Date(startDate) } },
            { event: { frequency: EventFrequency.WEEKLY } } 
        ];
    }
    if (endDate) {
        const specificDateCondition = { specificDate: { lte: new Date(endDate) } };
        if (eventTimingsWhere.OR) {
            eventTimingsWhere.OR.forEach(condition => {
                if (condition.specificDate) {
                    condition.specificDate = { ...condition.specificDate, ...specificDateCondition.specificDate };
                } else { 
                    condition.event = { ...condition.event, specificDate: { lte: new Date(endDate) } }; 
                }
            });
             if (!eventTimingsWhere.OR.some(c => c.event?.frequency === EventFrequency.WEEKLY)) {
                eventTimingsWhere.OR.push({ event: { frequency: EventFrequency.WEEKLY } });
            }
        } else {
             eventTimingsWhere.OR = [
                specificDateCondition,
                { event: { frequency: EventFrequency.WEEKLY } }
            ];
        }
    }

    if (Object.keys(eventTimingsWhere).length > 0) {
        whereClause.eventTimings = { some: eventTimingsWhere };
    }

    try {
        const events = await prisma.event.findMany({
            where: whereClause,
            include: {
                eventTimings: { orderBy: [{ specificDate: 'asc' }, { dayOfWeek: 'asc' }, { startTime: 'asc' }] },
                department: true,
                assignedRooms: { select: { id: true, roomNumber: true, category: true, features: true } },
                createdByUser: { select: { id: true, email: true, role: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.status(200).json(events);
    } catch (error) {
        console.error("Get Events Error:", error);
        next(error);
    }
});

// --- GET /api/events/:id - Get a single event by ID ---
// Access: Admin, Faculty, User
router.get('/:id', authorize(UserRole.Admin, UserRole.Faculty, UserRole.User), async (req, res, next) => {
    const { id } = req.params;
    try {
        const event = await prisma.event.findUnique({
            where: { id: parseInt(id) },
            include: {
                eventTimings: { orderBy: [{ specificDate: 'asc' }, { dayOfWeek: 'asc' }, { startTime: 'asc' }] },
                department: true,
                assignedRooms: { select: { id: true, roomNumber: true, category: true, features: true } },
                createdByUser: { select: { id: true, email: true, role: true } },
            },
        });
        if (!event) {
            return res.status(404).json({ message: 'Event not found.' });
        }
        res.status(200).json(event);
    } catch (error) {
        console.error("Get Event by ID Error:", error);
        next(error);
    }
});

// --- PUT /api/events/:id - Update an event ---
// Access: Admin Only
router.put('/:id', authorize(UserRole.Admin), async (req, res, next) => {
    const { id } = req.params;
    const {
        title, description, frequency, departmentId,
        assignedRoomIds, 
        eventTimings 
    } = req.body;

    try {
        const eventToUpdate = await prisma.event.findUnique({ where: { id: parseInt(id) } });
        if (!eventToUpdate) return res.status(404).json({ message: "Event not found." });

        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (frequency !== undefined) {
            if (!Object.values(EventFrequency).includes(frequency)) return res.status(400).json({ message: 'Invalid event frequency.' });
            updateData.frequency = frequency;
        }
        if (departmentId !== undefined) updateData.departmentId = departmentId ? parseInt(departmentId) : null;
        
        if (assignedRoomIds !== undefined) {
            updateData.assignedRooms = assignedRoomIds && assignedRoomIds.length > 0
                ? { set: assignedRoomIds.map(roomId => ({ id: parseInt(roomId) })) } 
                : { set: [] }; 
        }

        if (eventTimings && Array.isArray(eventTimings)) {
            updateData.eventTimings = {
                deleteMany: {}, 
                create: eventTimings.map(et => {
                    if (!et.dayOfWeek || !et.startTime || !et.endTime) {
                        throw new Error('Each event timing must have dayOfWeek, startTime, and endTime.');
                    }
                     if (timeToMinutes(et.startTime) >= timeToMinutes(et.endTime)) {
                        throw new Error(`Event end time must be after start time for ${et.dayOfWeek} ${et.startTime}.`);
                    }
                    const currentFrequency = frequency || eventToUpdate.frequency; 
                    if (currentFrequency === EventFrequency.ONCE && !et.specificDate) {
                         throw new Error(`Specific date is required for ONCE event timings.`);
                    }
                    return {
                        dayOfWeek: et.dayOfWeek,
                        startTime: et.startTime,
                        endTime: et.endTime,
                        specificDate: currentFrequency === EventFrequency.ONCE && et.specificDate ? new Date(et.specificDate) : null,
                    };
                }),
            };
        }

        const updatedEvent = await prisma.event.update({
            where: { id: parseInt(id) },
            data: updateData,
            include: {
                eventTimings: true,
                department: true,
                assignedRooms: { select: { id: true, roomNumber: true, category: true, features: true } },
                createdByUser: { select: { id: true, email: true, role: true } },
            },
        });
        res.status(200).json(updatedEvent);
    } catch (error) {
        console.error("Update Event Error:", error);
         if (error.message.includes('Each event timing must') || error.message.includes('Invalid event frequency') || error.message.includes('Specific date is required')) {
            return res.status(400).json({ message: error.message });
        }
        if (error.code === 'P2025') { 
            return res.status(404).json({ message: 'Event not found or related record (e.g., room) missing.' });
        }
        next(error);
    }
});

// --- DELETE /api/events/:id - Delete an event ---
// Access: Admin Only
router.delete('/:id', authorize(UserRole.Admin), async (req, res, next) => {
    const { id } = req.params;
    try {
        const eventToDelete = await prisma.event.findUnique({ where: { id: parseInt(id) } });
        if (!eventToDelete) return res.status(404).json({ message: "Event not found." });

        await prisma.event.delete({
            where: { id: parseInt(id) },
        });
        res.status(200).json({ message: 'Event deleted successfully.' });
    } catch (error) {
        console.error("Delete Event Error:", error);
        if (error.code === 'P2025') {
            return res.status(404).json({ message: 'Event not found.' });
        }
        next(error);
    }
});


// --- POST /api/events/check-clashes - Check for potential clashes ---
// Access: Admin, Faculty
router.post('/check-clashes', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const {
        eventTimings, 
        assignedRoomIds, 
    } = req.body;

    if (!eventTimings || !Array.isArray(eventTimings) || eventTimings.length === 0) {
        return res.status(400).json({ message: 'Event timings are required to check for clashes.' });
    }

    try {
        const timetableSlotWhere = {
            OR: []
        };

        eventTimings.forEach(et => {
            const timingCondition = {
                dayOfWeek: et.dayOfWeek,
                startTime: { lt: et.endTime },
                endTime: { gt: et.startTime },
            };
            timetableSlotWhere.OR.push(timingCondition);
        });
        
        if (assignedRoomIds && Array.isArray(assignedRoomIds) && assignedRoomIds.length > 0) {
            timetableSlotWhere.roomId = { in: assignedRoomIds.map(id => parseInt(id)) };
        }

        let existingSlotsInTimespan = [];
        if (timetableSlotWhere.OR.length > 0) { 
             existingSlotsInTimespan = await prisma.timetableSlot.findMany({
                where: timetableSlotWhere,
                include: {
                    subject: { select: { name: true } },
                    faculty: { select: { name: true } },
                    division: { select: { name: true } },
                    room: { select: { roomNumber: true } },
                },
            });
        }

        const clashes = checkOverlaps(eventTimings, existingSlotsInTimespan);

        if (clashes.length > 0) {
            return res.status(200).json({
                message: `Potential clashes found for ${clashes.length} of the event timings.`,
                clashes: clashes,
            });
        }

        res.status(200).json({
            message: 'No direct clashes found with existing timetable slots based on provided criteria.',
            clashes: [],
        });

    } catch (error) {
        console.error("Check Clashes Error:", error);
        next(error);
    }
});

// --- PUT /api/events/:id/reminder - Set or update reminder for an event ---
// Access: Admin Only
router.put('/:id/reminder', authorize(UserRole.Admin), async (req, res, next) => {
    const { id } = req.params;
    const { reminderEnabled, reminderDateTime } = req.body; 

    if (typeof reminderEnabled !== 'boolean') {
        return res.status(400).json({ message: 'reminderEnabled (boolean) is required.' });
    }
    if (reminderEnabled && !reminderDateTime) {
        return res.status(400).json({ message: 'reminderDateTime is required if reminder is enabled.' });
    }

    try {
        const eventToUpdate = await prisma.event.findUnique({ where: { id: parseInt(id) } });
        if (!eventToUpdate) {
            return res.status(404).json({ message: "Event not found." });
        }

        const updatedEvent = await prisma.event.update({
            where: { id: parseInt(id) },
            data: {
                reminderEnabled: reminderEnabled,
                reminderDateTime: reminderEnabled && reminderDateTime ? new Date(reminderDateTime) : null,
            },
            select: { id: true, title:true, reminderEnabled: true, reminderDateTime: true } 
        });
        res.status(200).json({ message: 'Event reminder updated successfully.', event: updatedEvent });
    } catch (error) {
        console.error("Update Event Reminder Error:", error);
        if (error.code === 'P2025') {
            return res.status(404).json({ message: 'Event not found.' });
        }
        next(error);
    }
});

export default router;
