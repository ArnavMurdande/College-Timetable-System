// File: server/routes/adminRoutes.js

import express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { protect, authorize } from '../middleware/authMiddleware.js';

const prisma = new PrismaClient();
const router = express.Router();

// Middleware for all admin routes
router.use(protect);
router.use(authorize(UserRole.Admin));

// GET All Users
router.get('/users', async (req, res, next) => {
  try {
    const onlyPending = req.query.pending === 'true';
    const whereClause = onlyPending ? { role: UserRole.User, isPending: true } : {};
    const users = await prisma.user.findMany({
      where: whereClause,
      select: { id: true, email: true, role: true, isPending: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(users);
  } catch (error) {
    console.error("Admin Get Users Error:", error);
    next(error);
  }
});

// UPDATE User Role
router.put('/users/:userId/role', async (req, res, next) => {
  const { userId } = req.params;
  const { role } = req.body;
  const targetUserId = parseInt(userId);

  if (isNaN(targetUserId)) return res.status(400).json({ message: 'Invalid user ID format.' });
  if (!role || !Object.values(UserRole).includes(role)) return res.status(400).json({ message: `Invalid role provided. Must be one of: ${Object.values(UserRole).join(', ')}` });
  if (targetUserId === req.user.id) return res.status(400).json({ message: 'Admins cannot change their own role via this endpoint.' });

  try {
    const userToUpdate = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!userToUpdate) return res.status(404).json({ message: 'User not found.' });

    const newPendingStatus = (role === UserRole.Admin || role === UserRole.Faculty) ? false : true;
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { role: role, isPending: newPendingStatus },
      select: { id: true, email: true, role: true, isPending: true },
    });
    res.status(200).json({ message: 'User role updated successfully.', user: updatedUser });
  } catch (error) {
    console.error("Admin Update User Role Error:", error);
    next(error);
  }
});

// --- **ADDED:** DELETE User ---
// Path: DELETE /api/admin/users/:userId
router.delete('/users/:userId', async (req, res, next) => {
    const { userId } = req.params;
    const targetUserId = parseInt(userId);
    const requestingAdminId = req.user.id; // ID of the admin making the request

    // --- Input Validation ---
    if (isNaN(targetUserId)) {
        return res.status(400).json({ message: 'Invalid user ID format.' });
    }

    // --- Prevent Admin Self-Deletion ---
    if (targetUserId === requestingAdminId) {
        return res.status(400).json({ message: 'Admins cannot delete their own account.' });
    }

    try {
        // --- Check if user exists before attempting delete ---
        const userToDelete = await prisma.user.findUnique({
            where: { id: targetUserId },
            // Include related Faculty to check if we need to delete that too (if applicable)
            // If the relation is set to Cascade, Prisma handles it. If not, manual deletion might be needed.
            // include: { faculty: true }
        });

        if (!userToDelete) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // --- Perform Deletion ---
        // Prisma will handle cascading deletes based on schema relations (e.g., deleting related Faculty if onDelete: Cascade is set)
        await prisma.user.delete({
            where: { id: targetUserId },
        });

        res.status(200).json({ message: `User ID ${targetUserId} deleted successfully.` });

    } catch (error) {
        console.error("Admin Delete User Error:", error);
        // Handle specific Prisma errors if needed (e.g., P2025 if somehow user disappeared between check and delete)
        if (error.code === 'P2025') {
             return res.status(404).json({ message: 'User not found.' });
        }
        next(error);
    }
});


export default router;
