// File: server/routes/authRoutes.js

import express from 'express';
import bcrypt from 'bcryptjs'; // For password hashing and comparison
import jwt from 'jsonwebtoken'; // For creating session tokens (used later)
import { PrismaClient, UserRole } from '@prisma/client'; // Import UserRole enum

// Initialize Prisma Client
const prisma = new PrismaClient();
// Create an Express router
const router = express.Router();

// --- Environment Variables (Important for JWT Secret) ---
// Ensure JWT_SECRET is set in your .env file in the server directory
const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_REALLY_SECRET_KEY_CHANGE_ME'; // Use a strong default only for testing
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d'; // Token expiry time (e.g., 1 day)

// --- Signup Route ---
// Handles new user registration
// Path: POST /api/auth/signup
router.post('/signup', async (req, res, next) => {
  // Get email and password from the request body
  const { email, password, confirmPassword } = req.body;

  // --- Basic Input Validation ---
  if (!email || !password || !confirmPassword) {
    return res.status(400).json({ message: 'Please provide email, password, and confirm password.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match.' });
  }
  // Basic password length check (example)
  if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
  }

  try {
    // --- Check if user already exists ---
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }, // Store emails in lowercase for consistency
    });

    if (existingUser) {
      return res.status(409).json({ message: 'Email already in use.' }); // 409 Conflict
    }

    // --- Hash the password ---
    const hashedPassword = await bcrypt.hash(password, 12); // 12 is a common salt round value

    // --- Create the new user in the database ---
    // Role defaults to 'User' and isPending defaults to 'true' based on schema
    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: hashedPassword,
      },
      // Select only the fields we want to send back (exclude passwordHash)
      select: {
        id: true,
        email: true,
        role: true,
        isPending: true, // Include isPending status
        createdAt: true,
      },
    });

    // --- Generate JWT Token (Log them in immediately after signup) ---
    const token = jwt.sign(
      { userId: newUser.id, email: newUser.email, role: newUser.role }, // Payload
      JWT_SECRET, // Secret key
      { expiresIn: JWT_EXPIRES_IN } // Expiration time
    );

    // --- Send Success Response ---
    res.status(201).json({
      message: 'User created successfully! Account pending admin approval.',
      user: newUser,
      token: token,
      expiresIn: JWT_EXPIRES_IN
    });

  } catch (error) {
    console.error("Signup Error:", error);
    next(error); // Pass error to the global error handler
  }
});

// --- Login Route ---
// Handles existing user login
// Path: POST /api/auth/login
router.post('/login', async (req, res, next) => {
  const { email, password } = req.body;

  // --- Basic Input Validation ---
  if (!email || !password) {
    return res.status(400).json({ message: 'Please provide email and password.' });
  }

  try {
    // --- Find user by email ---
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // --- Check if user exists ---
    if (!user) {
      console.log(`Login attempt failed: Email not found - ${email.toLowerCase()}`);
      return res.status(401).json({ message: 'Invalid email or password.' }); // 401 Unauthorized
    }

    // --- Compare provided password with stored hash ---
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    // --- Check if password is valid ---
    if (!isPasswordValid) {
      console.log(`Login attempt failed: Invalid password for email - ${email.toLowerCase()}`);
      return res.status(401).json({ message: 'Invalid email or password.' }); // 401 Unauthorized
    }

    // --- Generate JWT Token ---
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role }, // Payload
      JWT_SECRET, // Secret key
      { expiresIn: JWT_EXPIRES_IN } // Expiration time
    );

    // --- Send Success Response ---
    res.status(200).json({
      message: 'Login successful!',
      user: { // Explicitly select fields to send back
        id: user.id,
        email: user.email,
        role: user.role,
        isPending: user.isPending, // Include pending status
      },
      token: token,
      expiresIn: JWT_EXPIRES_IN
    });

  } catch (error) {
    console.error("Login Error:", error);
    next(error);
  }
});


// --- Placeholder for Profile Update Routes (Requires Authentication Middleware later) ---
// These require the user to be logged in (token sent in header)

// Import the middleware - Assuming it exists in ../middleware/authMiddleware.js
// If not, create it first!
import { protect } from '../middleware/authMiddleware.js';

// Update Email - Protected Route
// Path: PUT /api/auth/update-email
router.put('/update-email', protect, async (req, res, next) => { // Added protect middleware
  // Get userId from the token payload (added by protect middleware)
  const userId = req.user.id;
  const { newEmail } = req.body; // Only need new email from body

  if (!newEmail) {
    return res.status(400).json({ message: 'New email is required.' });
  }
  // Add email format validation if needed

  try {
    // Check if new email is already taken by another user
    const existingUser = await prisma.user.findUnique({ where: { email: newEmail.toLowerCase() } });
    if (existingUser && existingUser.id !== userId) {
      return res.status(409).json({ message: 'New email already in use.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { email: newEmail.toLowerCase() },
      select: { id: true, email: true, role: true, isPending: true }, // Exclude passwordHash
    });
    res.status(200).json({ message: 'Email updated successfully.', user: updatedUser });
  } catch (error) {
    console.error("Update Email Error:", error);
    next(error);
  }
});

// Update Password - Protected Route
// Path: PUT /api/auth/update-password
router.put('/update-password', protect, async (req, res, next) => { // Added protect middleware
  const userId = req.user.id; // Get userId from token
  const { currentPassword, newPassword, confirmNewPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return res.status(400).json({ message: 'Current password, new password, and confirmation are required.' });
  }
  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ message: 'New passwords do not match.' });
  }
  if (newPassword.length < 6) { // Example validation
      return res.status(400).json({ message: 'New password must be at least 6 characters long.' });
  }

  try {
    // Get user and their current password hash
    const user = await prisma.user.findUnique({ where: { id: userId } });
    // User should exist if protect middleware passed, but double check
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ message: 'Incorrect current password.' });
    }

    // Hash the new password
    const newHashedPassword = await bcrypt.hash(newPassword, 12);

    // Update the password in the database
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHashedPassword },
    });

    res.status(200).json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error("Update Password Error:", error);
    next(error);
  }
});


// Export the router to be used in server.js
export default router;
