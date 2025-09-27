// File: server/server.js

// --- Import Core Modules ---
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Import Route Handlers ---
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import departmentRoutes from './routes/departmentRoutes.js';
import subjectRoutes from './routes/subjectRoutes.js';
import facultyRoutes from './routes/facultyRoutes.js';
import syllabusRoutes from './routes/syllabusRoutes.js';
import divisionRoutes from './routes/divisionRoutes.js';
import studentElectiveChoiceRoutes from './routes/studentElectiveChoiceRoutes.js';
import loadAllocationRoutes from './routes/loadAllocationRoutes.js';
import loadCalculationRoutes from './routes/loadCalculationRoutes.js';
import timetableRoutes from './routes/timetableRoutes.js';
import eventRoutes from './routes/eventRoutes.js'; // <-- ADDED: Import event routes

// --- Initial Setup ---
dotenv.config();
const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 5001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Global Middleware ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- API Test Route ---
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend API is alive and kicking!' });
});

// --- Mount Application Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/syllabus', syllabusRoutes);
app.use('/api/divisions', divisionRoutes);
app.use('/api/elective-choices', studentElectiveChoiceRoutes);
app.use('/api/load-allocations', loadAllocationRoutes);
app.use('/api/load-calculation', loadCalculationRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/events', eventRoutes); // <-- ADDED: Mount event routes

// --- Global Error Handler Middleware ---
app.use((err, req, res, next) => {
  console.error("An error occurred:", err.stack);
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
     message: err.message || 'Something went terribly wrong on the server!',
     ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
  });
});

// --- Start the HTTP Server ---
app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
  console.log(`Static files served from: ${path.join(__dirname, 'public')}`);
  console.log(`Current Node environment: ${process.env.NODE_ENV || 'development'}`);
});

// --- Graceful Shutdown Logic ---
const shutdown = async (signal) => {
    console.log(`\n${signal} signal received. Shutting down gracefully...`);
    try {
        await prisma.$disconnect();
        console.log('Prisma client disconnected successfully.');
        process.exit(0);
    } catch (e) {
        console.error('Error during shutdown:', e);
        process.exit(1);
    }
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
