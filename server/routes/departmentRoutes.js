// File: server/routes/departmentRoutes.js

import express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { protect, authorize } from '../middleware/authMiddleware.js';

const prisma = new PrismaClient();
const router = express.Router();

// --- Apply Authentication Middleware to all department routes ---
router.use(protect);

// --- GET All Departments ---
// Path: GET /api/departments
// Access: Admin, Faculty (Faculty needs to list departments for selection)
router.get('/', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' },
    });
    res.status(200).json(departments);
  } catch (error) {
    console.error("Get Departments Error:", error);
    next(error);
  }
});

// --- Admin Only Routes for Department Management (Create, Update, Delete) ---

// --- POST Create New Department ---
// Path: POST /api/departments
// Access: Admin
router.post('/', authorize(UserRole.Admin), async (req, res, next) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Department name is required and must be a non-empty string.' });
  }
  const trimmedName = name.trim();
  try {
    const existingDepartment = await prisma.department.findUnique({
      where: { name: trimmedName },
    });
    if (existingDepartment) {
      return res.status(409).json({ message: `Department '${trimmedName}' already exists.` });
    }
    const newDepartment = await prisma.department.create({
      data: { name: trimmedName },
    });
    res.status(201).json({ message: 'Department created successfully.', department: newDepartment });
  } catch (error) {
    console.error("Create Department Error:", error);
    if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
      return res.status(409).json({ message: `Department name '${trimmedName}' already exists.` });
    }
    next(error);
  }
});

// --- PUT Update Department ---
// Path: PUT /api/departments/:departmentId
// Access: Admin
router.put('/:departmentId', authorize(UserRole.Admin), async (req, res, next) => {
  const { departmentId } = req.params;
  const { name } = req.body;
  const targetDepartmentId = parseInt(departmentId);

  if (isNaN(targetDepartmentId)) {
    return res.status(400).json({ message: 'Invalid Department ID format.' });
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Department name is required and must be a non-empty string.' });
  }
  const trimmedName = name.trim();
  try {
    const conflictingDepartment = await prisma.department.findFirst({
      where: {
        name: trimmedName,
        id: { not: targetDepartmentId },
      },
    });
    if (conflictingDepartment) {
      return res.status(409).json({ message: `Department name '${trimmedName}' is already used by another department.` });
    }
    const updatedDepartment = await prisma.department.update({
      where: { id: targetDepartmentId },
      data: { name: trimmedName },
    });
    res.status(200).json({ message: 'Department updated successfully.', department: updatedDepartment });
  } catch (error) {
    console.error("Update Department Error:", error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: `Department with ID ${targetDepartmentId} not found.` });
    }
    if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
      return res.status(409).json({ message: `Cannot update department name to '${trimmedName}' as it is already used.` });
    }
    next(error);
  }
});

// --- DELETE Department ---
// Path: DELETE /api/departments/:departmentId
// Access: Admin
router.delete('/:departmentId', authorize(UserRole.Admin), async (req, res, next) => {
  const { departmentId } = req.params;
  const targetDepartmentId = parseInt(departmentId);

  if (isNaN(targetDepartmentId)) {
    return res.status(400).json({ message: 'Invalid Department ID format.' });
  }
  try {
    // Check for related records before attempting to delete
    // This is a more robust check than relying solely on Prisma's P2003 error,
    // as it allows for a more user-friendly message.

    const relatedSubjects = await prisma.subject.count({ where: { departmentId: targetDepartmentId } });
    const relatedFaculty = await prisma.faculty.count({ where: { departmentId: targetDepartmentId } });
    const relatedDivisions = await prisma.division.count({ where: { departmentId: targetDepartmentId } });
    // Add checks for other related models if necessary (e.g., Events, StudentElectiveChoices, CustomLabGroupSets)
    const relatedEvents = await prisma.event.count({ where: { departmentId: targetDepartmentId } });
    const relatedStudentChoices = await prisma.studentElectiveChoice.count({ where: { departmentId: targetDepartmentId } });
    const relatedCustomLabSets = await prisma.customLabGroupSet.count({ where: { departmentId: targetDepartmentId } });


    let existingReferencesMessages = [];
    if (relatedSubjects > 0) existingReferencesMessages.push(`${relatedSubjects} subject(s)`);
    if (relatedFaculty > 0) existingReferencesMessages.push(`${relatedFaculty} faculty member(s)`);
    if (relatedDivisions > 0) existingReferencesMessages.push(`${relatedDivisions} division(s)`);
    if (relatedEvents > 0) existingReferencesMessages.push(`${relatedEvents} event(s)`);
    if (relatedStudentChoices > 0) existingReferencesMessages.push(`${relatedStudentChoices} student elective choice(s)`);
    if (relatedCustomLabSets > 0) existingReferencesMessages.push(`${relatedCustomLabSets} custom lab group set(s)`);
    // Note: Rooms have onDelete: SetNull for departmentId, so they don't block deletion but will become unassigned.

    if (existingReferencesMessages.length > 0) {
        return res.status(409).json({ 
            message: `Cannot delete department. It is associated with: ${existingReferencesMessages.join(', ')}. Please reassign or delete these records first.` 
        });
    }

    // If no blocking references, proceed with deletion
    await prisma.department.delete({
      where: { id: targetDepartmentId },
    });
    // Note: Rooms linked to this department will have their departmentId set to null due to `onDelete: SetNull` in schema.prisma
    res.status(200).json({ message: `Department with ID ${targetDepartmentId} deleted successfully. Associated rooms are now unassigned.` });
  } catch (error) {
    console.error("Delete Department Error:", error);
    if (error.code === 'P2025') { // Should be caught by the checks above, but as a fallback
      return res.status(404).json({ message: `Department with ID ${targetDepartmentId} not found.` });
    }
    // P2003 might still occur if there are other relations not explicitly checked above that restrict delete.
    if (error.code === 'P2003') { 
        return res.status(409).json({ message: `Cannot delete department ID ${targetDepartmentId} due to existing references in other records (e.g., subjects, faculty, divisions, events). Please remove these references first.` });
    }
    next(error);
  }
});

export default router;
