// File: server/routes/syllabusRoutes.js
import express from 'express';
import { PrismaClient, UserRole, SyllabusType, SubjectType } from '@prisma/client'; // Added SubjectType
import { protect, authorize } from '../middleware/authMiddleware.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises'; 
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();
const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const syllabusUploadDir = path.join(__dirname, '..', 'public', 'uploads', 'syllabus');

const ensureUploadDirExists = async () => {
    try {
        await fs.mkdir(syllabusUploadDir, { recursive: true });
        console.log(`Syllabus upload directory ensured: ${syllabusUploadDir}`);
    } catch (error) {
        console.error('Error creating syllabus upload directory:', error);
    }
};
ensureUploadDirExists(); 

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, syllabusUploadDir);
    },
    filename: function (req, file, cb) {
        const subjectId = req.body.subjectId || req.params.subjectId || 'unknownsubject';
        const syllabusType = req.body.type || 'generalsyllabus'; 
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_'); 
        cb(null, `subject-${subjectId}-${syllabusType}-${uniqueSuffix}-${safeOriginalName}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('Only PDF files are allowed for syllabus uploads!'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 10 }, 
    fileFilter: fileFilter
});

router.use(protect);

// --- GET Subjects for Syllabus Upload ---
// MODIFIED: Added subjectType filter and dynamic sorting
router.get('/subjects-for-selection', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { departmentId, year, semesterType, subjectType, sortBy, order } = req.query; // Added subjectType, sortBy, order

    if (!departmentId || !year || !semesterType) {
        return res.status(400).json({ message: 'Department, Year, and Semester Type are required.' });
    }
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) {
        return res.status(400).json({ message: 'Invalid Year.' });
    }
    if (!['odd', 'even'].includes(String(semesterType).toLowerCase())) {
        return res.status(400).json({ message: "Invalid Semester Type." });
    }
    const calculatedSemester = (semesterType.toLowerCase() === 'odd') ? (yearNum * 2 - 1) : (yearNum * 2);

    const whereClause = {
        departmentId: parseInt(departmentId),
        year: yearNum,
        semester: calculatedSemester,
    };

    // Add subjectType to whereClause if provided and valid
    if (subjectType && Object.values(SubjectType).includes(subjectType)) {
        whereClause.subjectType = subjectType;
    }
    
    // Determine orderBy based on sortBy and order query parameters
    let orderByClause = [];
    const validSortKeys = ['code', 'name', 'subjectType']; // Add more valid keys if needed
    if (sortBy && validSortKeys.includes(sortBy)) {
        orderByClause.push({ [sortBy]: order === 'desc' ? 'desc' : 'asc' });
    } else {
        orderByClause.push({ code: 'asc' }); // Default sort
    }
    // Add a secondary sort to ensure consistent ordering for items with the same primary sort key
    if (!orderByClause.find(o => o.id)) { // Avoid duplicate 'id' sort if already primary
        orderByClause.push({ id: 'asc' });
    }


    try {
        const subjects = await prisma.subject.findMany({
            where: whereClause,
            select: {
                id: true,
                code: true,
                name: true,
                subjectType: true, // Include subjectType for display/verification
                practicalHours: true, 
                syllabi: { 
                    select: {
                        id: true,
                        type: true,
                        filePath: true,
                        year: true,
                        semester: true
                    }
                }
            },
            orderBy: orderByClause, // Use dynamic orderBy
        });
        res.status(200).json(subjects);
    } catch (error) {
        console.error("Get Subjects for Syllabus Error:", error);
        next(error);
    }
});


// --- POST Upload New Syllabus ---
router.post('/', authorize(UserRole.Admin, UserRole.Faculty), upload.single('syllabusFile'), async (req, res, next) => {
    const { subjectId, type } = req.body; 
    const userId = req.user.id; 

    if (!req.file) {
        return res.status(400).json({ message: 'No syllabus file uploaded.' });
    }
    if (!subjectId || !type) {
        try { await fs.unlink(req.file.path); } catch (e) { console.error("Error deleting orphaned syllabus file:", e); }
        return res.status(400).json({ message: 'Subject ID and Syllabus Type (Theory/Lab) are required.' });
    }
    if (!Object.values(SyllabusType).includes(type)) {
        try { await fs.unlink(req.file.path); } catch (e) { console.error("Error deleting orphaned syllabus file:", e); }
        return res.status(400).json({ message: 'Invalid syllabus type.' });
    }

    const subjectIdNum = parseInt(subjectId);
    if (isNaN(subjectIdNum)) {
        try { await fs.unlink(req.file.path); } catch (e) { console.error("Error deleting orphaned syllabus file:", e); }
        return res.status(400).json({ message: 'Invalid Subject ID.' });
    }

    try {
        const subject = await prisma.subject.findUnique({ where: { id: subjectIdNum } });
        if (!subject) {
            try { await fs.unlink(req.file.path); } catch (e) { console.error("Error deleting orphaned syllabus file:", e); }
            return res.status(404).json({ message: `Subject with ID ${subjectIdNum} not found.` });
        }

        if (type === SyllabusType.Lab && subject.practicalHours === 0) {
            try { await fs.unlink(req.file.path); } catch (e) { console.error("Error deleting orphaned syllabus file:", e); }
            return res.status(400).json({ message: `Cannot upload Lab syllabus for subject '${subject.name}' as it has no practical hours.` });
        }

        const existingSyllabus = await prisma.syllabus.findUnique({
            where: { subjectId_type: { subjectId: subjectIdNum, type: type } },
        });

        if (existingSyllabus) {
            if (existingSyllabus.filePath) {
                const oldFilePath = path.join(__dirname, '..', 'public', existingSyllabus.filePath);
                try {
                    await fs.access(oldFilePath); 
                    await fs.unlink(oldFilePath);
                    console.log("Old syllabus file deleted:", oldFilePath);
                } catch (e) {
                    console.error("Error deleting old syllabus file (or file not found):", oldFilePath, e.message);
                }
            }
            const updatedSyllabus = await prisma.syllabus.update({
                where: { id: existingSyllabus.id },
                data: {
                    filePath: `/uploads/syllabus/${req.file.filename}`, 
                    year: subject.year, 
                    semester: subject.semester, 
                    updatedAt: new Date(),
                },
                include: { subject: { select: { name: true, code: true } } }
            });
             return res.status(200).json({ message: `Syllabus for ${subject.name} (${type}) updated successfully.`, syllabus: updatedSyllabus });
        } else {
            const newSyllabus = await prisma.syllabus.create({
                data: {
                    subjectId: subjectIdNum,
                    type: type,
                    filePath: `/uploads/syllabus/${req.file.filename}`, 
                    year: subject.year, 
                    semester: subject.semester, 
                },
                include: { subject: { select: { name: true, code: true } } }
            });
            return res.status(201).json({ message: `Syllabus for ${subject.name} (${type}) uploaded successfully.`, syllabus: newSyllabus });
        }

    } catch (error) {
        console.error("Upload Syllabus Error:", error);
        if (req.file?.path) {
            try { await fs.unlink(req.file.path); } catch (e) { console.error("Error deleting orphaned syllabus file after DB error:", e); }
        }
        if (error.code === 'P2002') { 
            return res.status(409).json({ message: `A ${type} syllabus for this subject already exists.` });
        }
        next(error);
    }
});

// --- GET All Syllabi (with filters) ---
router.get('/', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { departmentId, subjectId, year, semester, type } = req.query;
    const whereClause = {};
    const subjectWhereClause = {};

    if (departmentId) subjectWhereClause.departmentId = parseInt(departmentId);
    if (year) subjectWhereClause.year = parseInt(year); 
    if (semester) subjectWhereClause.semester = parseInt(semester); 
    
    if (Object.keys(subjectWhereClause).length > 0) {
        whereClause.subject = subjectWhereClause;
    }
    if (subjectId) whereClause.subjectId = parseInt(subjectId);
    if (type && Object.values(SyllabusType).includes(type)) whereClause.type = type;

    try {
        const syllabi = await prisma.syllabus.findMany({
            where: whereClause,
            include: {
                subject: {
                    select: { id: true, code: true, name: true, year: true, semester: true, subjectType: true, department: { select: { name: true }} }
                },
            },
            orderBy: [{ subject: { code: 'asc' } }, { type: 'asc' }]
        });
        res.status(200).json(syllabi);
    } catch (error) {
        console.error("Get Syllabi List Error:", error);
        next(error);
    }
});

// --- DELETE Syllabus ---
router.delete('/:syllabusId', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { syllabusId } = req.params;
    const idNum = parseInt(syllabusId);

    if (isNaN(idNum)) {
        return res.status(400).json({ message: "Invalid syllabus ID." });
    }

    try {
        const syllabusToDelete = await prisma.syllabus.findUnique({
            where: { id: idNum },
            include: { subject: { select: { name: true } } }
        });

        if (!syllabusToDelete) {
            return res.status(404).json({ message: "Syllabus entry not found." });
        }

        if (syllabusToDelete.filePath) {
            const fullFilePath = path.join(__dirname, '..', 'public', syllabusToDelete.filePath);
            try {
                await fs.access(fullFilePath); 
                await fs.unlink(fullFilePath);
                console.log("Syllabus file deleted:", fullFilePath);
            } catch (e) {
                console.error("Error deleting syllabus file (or file not found):", fullFilePath, e.message);
            }
        }

        await prisma.syllabus.delete({ where: { id: idNum } });

        res.status(200).json({ message: `Syllabus for ${syllabusToDelete.subject.name} (${syllabusToDelete.type}) deleted successfully.` });
    } catch (error) {
        console.error("Delete Syllabus Error:", error);
        if (error.code === 'P2025') { 
            return res.status(404).json({ message: "Syllabus entry not found (Prisma P2025)." });
        }
        next(error);
    }
});

export default router;
