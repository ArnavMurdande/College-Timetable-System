// File: server/routes/roomRoutes.js

import express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { protect, authorize } from '../middleware/authMiddleware.js';

const prisma = new PrismaClient();
const router = express.Router();

// All room routes require the user to be logged in (handled by protect)
// Specific role authorization is handled per route.
router.use(protect);


// --- GET All Rooms ---
// Path: GET /api/rooms
// Access: Admin, Faculty
// MODIFIED: Added departmentId filter
router.get('/', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
  try {
    const { category, floor, minCapacity, sortBy, order, features, departmentId } = req.query;
    let where = {};
    let orderBy = {};

    if (category) where.category = category;
    if (floor) {
        const floorNum = parseInt(floor);
        if (!isNaN(floorNum)) where.floor = floorNum;
        else return res.status(400).json({ message: 'Invalid floor number provided.' });
    }
    if (minCapacity) {
        const capacityNum = parseInt(minCapacity);
        if (!isNaN(capacityNum)) where.capacity = { gte: capacityNum };
        else return res.status(400).json({ message: 'Invalid minimum capacity provided.' });
    }
    if (features) {
        const featureList = features.split(',').map(f => f.trim()).filter(f => f);
        if (featureList.length > 0) {
            where.features = { hasEvery: featureList };
        }
    }
    // --- ADDED: Filter by departmentId ---
    if (departmentId) {
        if (departmentId.toLowerCase() === 'unassigned') {
            where.departmentId = null; // Filter for rooms with no department
        } else {
            const deptIdNum = parseInt(departmentId);
            if (!isNaN(deptIdNum)) {
                where.departmentId = deptIdNum;
            } else {
                return res.status(400).json({ message: 'Invalid department ID provided for filtering.' });
            }
        }
    }
    // If departmentId is not provided, rooms from all departments (or unassigned) will be fetched,
    // respecting other filters.

    if (sortBy) {
      orderBy[sortBy] = order === 'desc' ? 'desc' : 'asc';
    } else {
        orderBy = { roomNumber: 'asc' }; // Default sort
    }

    const rooms = await prisma.room.findMany({
        where,
        orderBy,
        include: { department: true } // Include department details
    });
    res.status(200).json(rooms);
  } catch (error) {
    console.error("Get Rooms Error:", error);
    if (error instanceof Error && error.message.includes('Invalid integer')) {
       return res.status(400).json({ message: 'Invalid query parameter format.' });
    }
    next(error);
  }
});

// --- POST Create New Room (Manual) ---
// Path: POST /api/rooms
// Access: Admin only
// MODIFIED: Added optional departmentId
router.post('/', authorize(UserRole.Admin), async (req, res, next) => {
  const { roomNumber, category, floor, capacity, features, departmentId } = req.body;

  if (!roomNumber || !category || floor === undefined || capacity === undefined) {
    return res.status(400).json({ message: 'Room Number, Category, Floor, and Capacity are required.' });
  }
  const floorNum = parseInt(floor);
  const capacityNum = parseInt(capacity);
  if (isNaN(floorNum) || floorNum < 0) {
      return res.status(400).json({ message: 'Floor must be a non-negative number.' });
  }
  if (isNaN(capacityNum) || capacityNum < 0) {
      return res.status(400).json({ message: 'Capacity must be a non-negative number.' });
  }
  const roomFeatures = Array.isArray(features)
    ? features.map(f => String(f).trim()).filter(f => f) : [];

  const roomData = {
    roomNumber: roomNumber.trim(),
    category: category.trim(),
    floor: floorNum,
    capacity: capacityNum,
    features: roomFeatures,
  };

  // --- ADDED: Handle optional departmentId ---
  if (departmentId !== undefined) {
    if (departmentId === null || departmentId === '') { // Explicitly unassign
        roomData.departmentId = null;
    } else {
        const deptIdNum = parseInt(departmentId);
        if (isNaN(deptIdNum)) {
            return res.status(400).json({ message: 'Invalid Department ID provided.' });
        }
        // Check if department exists
        const departmentExists = await prisma.department.findUnique({ where: { id: deptIdNum } });
        if (!departmentExists) {
            return res.status(404).json({ message: `Department with ID ${deptIdNum} not found.` });
        }
        roomData.departmentId = deptIdNum;
    }
  }
  // If departmentId is not provided at all in req.body, it will be undefined in Prisma (effectively null if schema allows)

  try {
    const existingRoom = await prisma.room.findUnique({ where: { roomNumber: roomData.roomNumber } });
    if (existingRoom) {
        return res.status(409).json({ message: `Room number '${roomData.roomNumber}' already exists.` });
    }
    const newRoom = await prisma.room.create({
      data: roomData,
      include: { department: true } // Include department details in response
    });
    res.status(201).json({ message: 'Room created successfully.', room: newRoom });
  } catch (error) {
    console.error("Create Room Error:", error);
    if (error.code === 'P2002' && error.meta?.target?.includes('roomNumber')) {
         return res.status(409).json({ message: `Room number '${roomData.roomNumber}' already exists.` });
    }
    // P2003: Foreign key constraint failed (e.g. if departmentId was invalid and not caught above)
    // This shouldn't happen if department existence is checked, but good to be aware.
    if (error.code === 'P2003' && error.meta?.field_name?.includes('departmentId')) {
        return res.status(400).json({ message: `Invalid department specified.` });
    }
    next(error);
  }
});


// --- POST Bulk Upload Rooms from CSV/Excel ---
// Path: POST /api/rooms/upload
// Access: Admin only
// MODIFIED: Added Department handling
router.post('/upload', authorize(UserRole.Admin), async (req, res, next) => {
  const { rooms: roomsToUpload } = req.body;

  if (!Array.isArray(roomsToUpload) || roomsToUpload.length === 0) {
    return res.status(400).json({ message: 'No room data provided or data is not in an array format.' });
  }

  const createdRoomsOutput = [];
  const errorsOutput = [];
  const VALID_CATEGORIES_SERVER = ['Lecture', 'Lab', 'Auditorium Hall']; // Keep in sync with frontend

  // Fetch all department names once for efficient lookup
  const departments = await prisma.department.findMany({ select: { id: true, name: true } });
  const departmentMap = new Map(departments.map(dept => [dept.name.toLowerCase(), dept.id]));

  for (let i = 0; i < roomsToUpload.length; i++) {
    const roomData = roomsToUpload[i];
    // --- ADDED: departmentName from upload data ---
    const { roomNumber, category, floor, capacity, features, departmentName } = roomData;

    // Rigorous Backend Validation for each room
    if (!roomNumber || typeof roomNumber !== 'string' || !roomNumber.trim() ||
        !category || typeof category !== 'string' || !category.trim() ||
        floor === undefined || typeof floor !== 'number' || floor < 0 ||
        capacity === undefined || typeof capacity !== 'number' || capacity < 0) {
      errorsOutput.push({ index: i, roomNumber: roomNumber || `Row ${i+1}`, message: `Missing or invalid required fields (Room Number, Category, Floor, Capacity). Floor and Capacity must be non-negative numbers.` });
      continue;
    }

    if (!VALID_CATEGORIES_SERVER.includes(category.trim())) {
        errorsOutput.push({ index: i, roomNumber: roomNumber, message: `Invalid category '${category}'. Allowed: ${VALID_CATEGORIES_SERVER.join(', ')}.` });
        continue;
    }

    const roomFeaturesArray = Array.isArray(features)
      ? features.map(f => String(f).trim()).filter(f => f)
      : (typeof features === 'string' ? features.split(',').map(f => f.trim()).filter(f => f) : []);

    const dataToCreate = {
      roomNumber: roomNumber.trim(),
      category: category.trim(),
      floor: floor,
      capacity: capacity,
      features: roomFeaturesArray,
      departmentId: null, // Default to unassigned
    };

    // --- ADDED: Resolve departmentName to departmentId ---
    if (departmentName && typeof departmentName === 'string' && departmentName.trim()) {
        const trimmedDeptName = departmentName.trim().toLowerCase();
        if (departmentMap.has(trimmedDeptName)) {
            dataToCreate.departmentId = departmentMap.get(trimmedDeptName);
        } else {
            // Behavior for non-existent department: error out for now.
            // Could be modified to create department if needed, but that adds complexity.
            errorsOutput.push({ index: i, roomNumber: roomNumber, message: `Department '${departmentName}' not found. Please create it first or leave blank for unassigned.` });
            continue;
        }
    }
    // If departmentName is blank or not provided, room remains unassigned (departmentId: null)

    try {
      const existingRoom = await prisma.room.findUnique({
        where: { roomNumber: dataToCreate.roomNumber },
      });

      if (existingRoom) {
        errorsOutput.push({ index: i, roomNumber: dataToCreate.roomNumber, message: `Room number '${dataToCreate.roomNumber}' already exists.` });
        continue;
      }

      const newRoom = await prisma.room.create({
        data: dataToCreate,
        include: { department: true }
      });
      createdRoomsOutput.push(newRoom);
    } catch (error) {
      console.error(`Error processing row ${i + 1} for room '${roomNumber}':`, error);
      let errorMessage = `Failed to process room '${roomNumber}'.`;
      if (error.code === 'P2002' && error.meta?.target?.includes('roomNumber')) {
         errorMessage = `Room number '${roomNumber}' already exists (prisma error).`;
      }
      errorsOutput.push({ index: i, roomNumber: roomNumber || `Row ${i+1}`, message: errorMessage, details: error.message });
    }
  }

  if (errorsOutput.length > 0) {
    const statusCode = errorsOutput.length === roomsToUpload.length ? 400 : 207;
    return res.status(statusCode).json({
      message: `Processed ${roomsToUpload.length} rooms. ${createdRoomsOutput.length} created successfully. ${errorsOutput.length} failed.`,
      createdCount: createdRoomsOutput.length,
      errorCount: errorsOutput.length,
      errors: errorsOutput,
    });
  }

  res.status(201).json({
    message: `Successfully created ${createdRoomsOutput.length} rooms.`,
    createdRooms: createdRoomsOutput,
  });
});


// --- PUT Update Existing Room ---
// Path: PUT /api/rooms/:roomId
// Access: Admin only
// MODIFIED: Added optional departmentId
router.put('/:roomId', authorize(UserRole.Admin), async (req, res, next) => {
  const { roomId } = req.params;
  // --- ADDED: departmentId to destructuring ---
  const { roomNumber, category, floor, capacity, features, departmentId } = req.body;
  const targetRoomId = parseInt(roomId);

  if (isNaN(targetRoomId)) {
    return res.status(400).json({ message: 'Invalid Room ID format.' });
  }
  // Check if at least one field is provided for update
  if (roomNumber === undefined && category === undefined && floor === undefined && capacity === undefined && features === undefined && departmentId === undefined) {
     return res.status(400).json({ message: 'No update data provided.' });
  }

   const updateData = {};
   if (roomNumber !== undefined) {
    if (typeof roomNumber !== 'string' || !roomNumber.trim()) return res.status(400).json({ message: 'Room number cannot be empty if provided.' });
    updateData.roomNumber = roomNumber.trim();
   }
   if (category !== undefined) {
    if (typeof category !== 'string' || !category.trim()) return res.status(400).json({ message: 'Category cannot be empty if provided.' });
    updateData.category = category.trim();
   }
   if (floor !== undefined) {
       const floorNum = parseInt(floor);
       if (isNaN(floorNum) || floorNum < 0) return res.status(400).json({ message: 'Floor must be a non-negative number.' });
       updateData.floor = floorNum;
   }
   if (capacity !== undefined) {
       const capacityNum = parseInt(capacity);
       if (isNaN(capacityNum) || capacityNum < 0) return res.status(400).json({ message: 'Capacity must be a non-negative number.' });
       updateData.capacity = capacityNum;
   }
   if (features !== undefined) {
       if (!Array.isArray(features)) return res.status(400).json({ message: 'Features must be an array of strings.' });
       updateData.features = features.map(f => String(f).trim()).filter(f => f);
   }
   // --- ADDED: Handle departmentId update ---
   if (departmentId !== undefined) {
     if (departmentId === null || departmentId === '') { // Allows unassigning a room
        updateData.departmentId = null;
     } else {
        const deptIdNum = parseInt(departmentId);
        if (isNaN(deptIdNum)) {
            return res.status(400).json({ message: 'Invalid Department ID provided for update.' });
        }
        const departmentExists = await prisma.department.findUnique({ where: { id: deptIdNum } });
        if (!departmentExists) {
            return res.status(404).json({ message: `Department with ID ${deptIdNum} not found.` });
        }
        updateData.departmentId = deptIdNum;
     }
   }

  try {
    if (updateData.roomNumber) {
        const existingRoom = await prisma.room.findUnique({ where: { roomNumber: updateData.roomNumber } });
        if (existingRoom && existingRoom.id !== targetRoomId) {
            return res.status(409).json({ message: `Room number '${updateData.roomNumber}' is already used by another room.` });
        }
    }
    const updatedRoom = await prisma.room.update({
      where: { id: targetRoomId },
      data: updateData,
      include: { department: true } // Include department details in response
    });
    res.status(200).json({ message: 'Room updated successfully.', room: updatedRoom });
  } catch (error) {
    console.error("Update Room Error:", error);
    if (error.code === 'P2025') { // Record to update not found
        return res.status(404).json({ message: `Room with ID ${targetRoomId} not found.` });
    }
    if (error.code === 'P2002' && error.meta?.target?.includes('roomNumber')) {
         return res.status(409).json({ message: `Cannot update room number to '${updateData.roomNumber}' as it is already used.` });
    }
    if (error.code === 'P2003' && error.meta?.field_name?.includes('departmentId')) {
        return res.status(400).json({ message: `Invalid department specified for update.` });
    }
    next(error);
  }
});

// --- DELETE Room ---
// Path: DELETE /api/rooms/:roomId
// Access: Admin only
router.delete('/:roomId', authorize(UserRole.Admin), async (req, res, next) => {
  const { roomId } = req.params;
  const targetRoomId = parseInt(roomId);

   if (isNaN(targetRoomId)) {
     return res.status(400).json({ message: 'Invalid Room ID format.' });
   }

  try {
    await prisma.room.delete({ where: { id: targetRoomId } });
    res.status(200).json({ message: `Room with ID ${targetRoomId} deleted successfully.` });
  } catch (error) {
    console.error("Delete Room Error:", error);
    if (error.code === 'P2025') {
        return res.status(404).json({ message: `Room with ID ${targetRoomId} not found.` });
    }
    if (error.code === 'P2003') { // Should be less likely now with onDelete: SetNull for department
        return res.status(409).json({ message: `Cannot delete room ${targetRoomId} due to other existing references (e.g., timetable slots, events). Please remove these references first.` });
    }
    next(error);
  }
});

export default router;
