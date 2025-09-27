// File: server/routes/studentElectiveChoiceRoutes.js
import express from 'express';
import { PrismaClient, UserRole, SubjectType, DivisionType } from '@prisma/client';
import { protect, authorize } from '../middleware/authMiddleware.js';
import multer from 'multer';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Apply protect middleware to all student elective choice routes
router.use(protect);
// REMOVED: router.use(authorize(UserRole.Admin, UserRole.Faculty));
// Authorization will now be applied on a per-route basis.

// Helper to calculate semester number (1-8) from academic year level (1-4) and semester type (odd/even)
const calculateSemesterNumber = (year, semesterType) => {
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) {
        return null;
    }
    const semTypeLower = String(semesterType).toLowerCase();
    if (semTypeLower === 'odd') {
        return yearNum * 2 - 1;
    } else if (semTypeLower === 'even') {
        return yearNum * 2;
    }
    return null; // Invalid semesterType
};

// --- GET Elective Subjects for Choice Entry ---
// Fetches DLO, ILOT subjects for a given department, year (1-4), and semesterType.
// Access: Admin, Faculty
router.get('/selectable-subjects', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { departmentId, year, semesterType } = req.query; // year is 1-4

    if (!departmentId || !year || !semesterType) {
        return res.status(400).json({ message: 'Department, Year (1-4), and Semester Type are required.' });
    }
    let calculatedSemester;
    try {
        calculatedSemester = calculateSemesterNumber(year, semesterType);
        if (calculatedSemester === null) throw new Error("Invalid year or semester type for semester calculation.");
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }
    const deptIdNum = parseInt(departmentId);
    const yearNum = parseInt(year);

    if (isNaN(deptIdNum) || isNaN(yearNum)) {
        return res.status(400).json({ message: "Invalid Department ID or Year format."});
    }

    try {
        const subjects = await prisma.subject.findMany({
            where: {
                departmentId: deptIdNum,
                year: yearNum,
                semester: calculatedSemester,
                subjectType: {
                    in: [SubjectType.DLO, SubjectType.ILOT], // Only DLO and ILOT subjects
                },
            },
            select: { id: true, code: true, name: true, subjectType: true, courseCategory: true },
            orderBy: [{ subjectType: 'asc' }, { courseCategory: 'asc' }, { name: 'asc' }],
        });
        res.status(200).json(subjects);
    } catch (error) {
        console.error("Get Selectable Elective Subjects Error:", error);
        next(error);
    }
});

// --- GET Permanent Batches for Choice Entry (Filtered for 'Common' linked divisions) ---
// Access: Admin, Faculty
router.get('/selectable-batches', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { departmentId, year, semesterType } = req.query; // year is 1-4

    if (!departmentId || !year || !semesterType) {
        return res.status(400).json({ message: 'Department, Year (1-4), and Semester Type are required.' });
    }
    let calculatedSemester;
    try {
        calculatedSemester = calculateSemesterNumber(year, semesterType);
        if (calculatedSemester === null) throw new Error("Invalid year or semester type for semester calculation.");
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }
    const deptIdNum = parseInt(departmentId);
    const yearNum = parseInt(year);

     if (isNaN(deptIdNum) || isNaN(yearNum)) {
        return res.status(400).json({ message: "Invalid Department ID or Year format."});
    }

    try {
        // Fetch permanent divisions that are linked to 'Common' subjects
        const permanentCommonDivisions = await prisma.division.findMany({
            where: {
                departmentId: deptIdNum,
                year: yearNum,
                semester: calculatedSemester,
                divisionType: DivisionType.Permanent,
                linkedSubjectType: SubjectType.Common,
            },
            select: { id: true, name: true }
        });

        if (permanentCommonDivisions.length === 0) {
            return res.status(200).json([]);
        }

        const batches = await prisma.batch.findMany({
            where: { permanentDivisionId: { in: permanentCommonDivisions.map(div => div.id) } },
            select: { id: true, name: true, permanentDivision: { select: { name: true, id: true } } },
            orderBy: [{ permanentDivision: { name: 'asc' } }, { name: 'asc' }],
        });
        res.status(200).json(batches.map(b => ({ ...b, divisionName: b.permanentDivision.name, divisionId: b.permanentDivision.id })));
    } catch (error) {
        console.error("Get Selectable Batches Error:", error);
        next(error); // Pass to global error handler
    }
});

// --- GET Permanent Divisions linked to 'Common' subjects (for View Filters) ---
// Access: Admin, Faculty
router.get('/common-permanent-divisions', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { departmentId, year, semesterType } = req.query; // year is 1-4 (academic year level)

    if (!departmentId || !year || !semesterType) {
        return res.status(400).json({ message: 'Department, Year Level (1-4), and Semester Type are required for fetching common divisions.' });
    }
    
    let calculatedSemester;
    try {
        calculatedSemester = calculateSemesterNumber(year, semesterType);
        if (calculatedSemester === null) {
            throw new Error("Invalid year level or semester type for semester calculation.");
        }
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }

    const deptIdNum = parseInt(departmentId);
    const yearNum = parseInt(year); // This is the academic year level (1-4)

    if (isNaN(deptIdNum) || isNaN(yearNum)) {
        return res.status(400).json({ message: "Invalid Department ID or Year Level format."});
    }

    try {
        const commonPermanentDivisions = await prisma.division.findMany({
            where: {
                departmentId: deptIdNum,
                year: yearNum, // Querying by academic year level
                semester: calculatedSemester, // Querying by actual semester number
                divisionType: DivisionType.Permanent,
                linkedSubjectType: SubjectType.Common, // Crucial filter
            },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });
        res.status(200).json(commonPermanentDivisions);
    } catch (error) {
        console.error("Get Common Permanent Divisions Error:", error);
        next(error);
    }
});


// --- POST Create or Update Student Elective Choices (Bulk) ---
// Access: Admin Only
router.post('/', authorize(UserRole.Admin), async (req, res, next) => {
    const choices = req.body.choices; 
    if (!Array.isArray(choices)) { 
        return res.status(400).json({ message: 'Invalid format. Expected an array of choices.' });
    }
    const results = { created: 0, updated: 0, deleted: 0, errors: [] };
    try {
        for (let i = 0; i < choices.length; i++) {
            const choice = choices[i];
            const { academicYear, semester, departmentId, subjectId, batchId, studentCount } = choice;

            if ([academicYear, semester, departmentId, subjectId, batchId, studentCount].some(val => val === undefined)) {
                results.errors.push({ index: i, message: 'Missing required fields.' }); continue;
            }
            const [ay, sem, deptIdNum, subId, bId, sCount] = [academicYear, semester, departmentId, subjectId, batchId, studentCount].map(Number);
            if ([ay, sem, deptIdNum, subId, bId, sCount].some(isNaN) || sCount < 0) {
                results.errors.push({ index: i, subjectId: choice.subjectId, batchId: choice.batchId, message: 'Invalid data types or negative student count.' }); continue;
            }

            const existingChoice = await prisma.studentElectiveChoice.findUnique({
                where: { academicYear_semester_departmentId_subjectId_batchId: { academicYear: ay, semester: sem, departmentId: deptIdNum, subjectId: subId, batchId: bId } }
            });

            if (sCount === 0 && existingChoice) {
                await prisma.studentElectiveChoice.delete({ where: { id: existingChoice.id } });
                results.deleted++;
            } else if (sCount > 0) {
                if (existingChoice) {
                    await prisma.studentElectiveChoice.update({ where: { id: existingChoice.id }, data: { studentCount: sCount } });
                    results.updated++;
                } else {
                    await prisma.studentElectiveChoice.create({ data: { academicYear: ay, semester: sem, departmentId: deptIdNum, subjectId: subId, batchId: bId, studentCount: sCount } });
                    results.created++;
                }
            }
        }
        if (results.errors.length > 0) {
            const statusCode = (results.created > 0 || results.updated > 0 || results.deleted > 0) ? 207 : 400;
            return res.status(statusCode).json({ message: `Processed choices with ${results.errors.length} errors.`, ...results });
        }
        res.status(201).json({ message: 'Student elective choices processed successfully.', ...results });
    } catch (error) {
        console.error("Bulk Save Elective Choices Error:", error);
        results.errors.push({ index: -1, message: error.message || "A general database error occurred." });
        return res.status(500).json({ message: "Failed to process choices due to a server error.", ...results });
    }
});

// --- GET Student Elective Choices (with more filters for viewing) ---
// Access: Admin, Faculty
router.get('/', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { 
        academicSessionYear, 
        departmentId, 
        yearLevel, 
        semesterType, 
        subjectType, 
        courseCategory, 
        subjectId,
        batchId, 
        divisionId 
    } = req.query;

    const where = {};
    const subjectWhere = { subjectType: { in: [SubjectType.DLO, SubjectType.ILOT] } }; 
    const batchWhere = {};

    if (academicSessionYear) where.academicYear = parseInt(academicSessionYear);
    if (departmentId) {
        const deptIdNum = parseInt(departmentId);
        where.departmentId = deptIdNum;
        subjectWhere.departmentId = deptIdNum; 
    }

    let calculatedSemester;
    if (yearLevel && semesterType) {
        calculatedSemester = calculateSemesterNumber(yearLevel, semesterType);
        if (calculatedSemester) {
            where.semester = calculatedSemester;
            subjectWhere.year = parseInt(yearLevel);
            subjectWhere.semester = calculatedSemester;
        } else {
            return res.status(400).json({ message: "Invalid year level or semester type for filtering." });
        }
    }
    
    if (subjectType && (subjectType === SubjectType.DLO || subjectType === SubjectType.ILOT)) {
        subjectWhere.subjectType = subjectType;
    }
    if (courseCategory) subjectWhere.courseCategory = { contains: courseCategory, mode: 'insensitive' };
    if (subjectId) where.subjectId = parseInt(subjectId);
    
    if (divisionId) { 
        batchWhere.permanentDivisionId = parseInt(divisionId);
    }
    if (batchId) where.batchId = parseInt(batchId);


    if (Object.keys(subjectWhere).length > 0) where.subject = subjectWhere;
    if (Object.keys(batchWhere).length > 0) where.batch = batchWhere;


    try {
        const choices = await prisma.studentElectiveChoice.findMany({
            where,
            include: {
                department: { select: { name: true } },
                subject: { select: { id: true, code: true, name: true, subjectType: true, courseCategory: true } },
                batch: { select: { id: true, name: true, permanentDivision: { select: { id: true, name: true } } } },
            },
            orderBy: [
                { academicYear: 'desc' }, { semester: 'asc' },
                { department: { name: 'asc' } },
                { subject: { name: 'asc' } }, { batch: { name: 'asc' } },
            ],
        });
        res.status(200).json(choices);
    } catch (error) {
        console.error("Get Student Elective Choices Error:", error);
        next(error);
    }
});

// --- POST Upload Elective Choices from Excel ---
// Access: Admin Only
router.post('/upload-excel', authorize(UserRole.Admin), upload.single('file'), async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No Excel file uploaded.' });
    }

    const results = { created: 0, updated: 0, deleted: 0, errors: [] };
    let rowNum = 1; 

    try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });

        if (jsonData.length === 0) {
            return res.status(400).json({ message: 'Excel file is empty or has no data rows.' });
        }

        const allDepartments = await prisma.department.findMany({ select: { id: true, name: true } });
        const departmentMap = new Map(allDepartments.map(d => [String(d.name).trim().toLowerCase(), d.id]));

        const allSubjects = await prisma.subject.findMany({ 
            where: { subjectType: { in: [SubjectType.DLO, SubjectType.ILOT] } },
            select: { id: true, code: true, name: true, departmentId: true } 
        });
        const subjectCodeMap = new Map(allSubjects.map(s => [`${String(s.code).trim().toLowerCase()}_${s.departmentId}`, s.id]));
        const subjectNameMap = new Map(allSubjects.map(s => [`${String(s.name).trim().toLowerCase()}_${s.departmentId}`, s.id]));


        const allPermanentDivisions = await prisma.division.findMany({
            where: { divisionType: DivisionType.Permanent }, 
            select: { id: true, name: true, departmentId: true }
        });
        const divisionMap = new Map(allPermanentDivisions.map(d => [`${String(d.name).trim().toLowerCase()}_${d.departmentId}`, d.id]));

        const allBatches = await prisma.batch.findMany({ select: { id: true, name: true, permanentDivisionId: true } });
        const batchMap = new Map(allBatches.map(b => [`${String(b.name).trim().toLowerCase()}_${b.permanentDivisionId}`, b.id]));


        for (const row of jsonData) {
            rowNum++; 
            const departmentName = row['Department Name'] || row['Department'];
            const academicSessionYearStr = row['Academic Session Start Year'] || row['Academic Year']; 
            const semesterNumberStr = row['Semester Number'] || row['Semester']; 
            const batchName = row['Batch Name'] || row['Batch'];
            const originalDivisionName = row['Original Division Name'] || row['Division'];
            const subjectCode = row['Subject Code'];
            const subjectName = row['Subject Name']; 
            const studentCountStr = row['Student Count'];

            if (!departmentName || !academicSessionYearStr || !semesterNumberStr || !batchName || !originalDivisionName || (!subjectCode && !subjectName) || studentCountStr === undefined || studentCountStr === null) {
                results.errors.push({ row: rowNum, message: "Missing required columns (Department, Academic Session Year, Semester Number, Batch, Original Division, Subject Code/Name, Student Count)." });
                continue;
            }

            const academicYear = parseInt(academicSessionYearStr);
            const semester = parseInt(semesterNumberStr);
            const studentCount = parseInt(studentCountStr);

            if (isNaN(academicYear) || academicYear < 2000 || academicYear > 2100) {
                results.errors.push({ row: rowNum, message: `Invalid Academic Session Year: ${academicSessionYearStr}. Expected YYYY format.` }); continue;
            }
            if (isNaN(semester) || semester < 1 || semester > 8) {
                results.errors.push({ row: rowNum, message: `Invalid Semester Number: ${semesterNumberStr}. Expected 1-8.` }); continue;
            }
            if (isNaN(studentCount) || studentCount < 0) {
                results.errors.push({ row: rowNum, message: `Invalid Student Count: ${studentCountStr}. Expected non-negative number.` }); continue;
            }

            const deptId = departmentMap.get(String(departmentName).trim().toLowerCase());
            if (!deptId) { results.errors.push({ row: rowNum, message: `Department '${departmentName}' not found.` }); continue; }

            const divisionId = divisionMap.get(`${String(originalDivisionName).trim().toLowerCase()}_${deptId}`);
            if (!divisionId) { results.errors.push({ row: rowNum, message: `Original Division '${originalDivisionName}' not found in Department '${departmentName}'.` }); continue; }
            
            const batchId = batchMap.get(`${String(batchName).trim().toLowerCase()}_${divisionId}`);
            if (!batchId) { results.errors.push({ row: rowNum, message: `Batch '${batchName}' not found in Division '${originalDivisionName}'.` }); continue; }

            let subjectIdVal;
            if (subjectCode) {
                subjectIdVal = subjectCodeMap.get(`${String(subjectCode).trim().toLowerCase()}_${deptId}`);
            }
            if (!subjectIdVal && subjectName) { 
                subjectIdVal = subjectNameMap.get(`${String(subjectName).trim().toLowerCase()}_${deptId}`);
            }
            if (!subjectIdVal) { results.errors.push({ row: rowNum, message: `Subject with Code '${subjectCode || 'N/A'}' or Name '${subjectName || 'N/A'}' not found in Department '${departmentName}' or is not DLO/ILOT.` }); continue; }

            const existingChoice = await prisma.studentElectiveChoice.findUnique({
                where: { academicYear_semester_departmentId_subjectId_batchId: { academicYear, semester, departmentId: deptId, subjectId: subjectIdVal, batchId } }
            });

            if (studentCount === 0 && existingChoice) {
                await prisma.studentElectiveChoice.delete({ where: { id: existingChoice.id } });
                results.deleted++;
            } else if (studentCount > 0) {
                if (existingChoice) {
                    await prisma.studentElectiveChoice.update({ where: { id: existingChoice.id }, data: { studentCount } });
                    results.updated++;
                } else {
                    await prisma.studentElectiveChoice.create({ data: { academicYear, semester, departmentId: deptId, subjectId: subjectIdVal, batchId, studentCount } });
                    results.created++;
                }
            }
        }

        let summaryMessage = `Excel import finished. Created: ${results.created}, Updated: ${results.updated}, Deleted: ${results.deleted}.`;
        if (results.errors.length > 0) {
            summaryMessage += ` Errors: ${results.errors.length}.`;
            return res.status(207).json({ message: summaryMessage, ...results });
        }
        res.status(201).json({ message: summaryMessage, ...results });

    } catch (error) {
        console.error("Excel Upload/Processing Error:", error);
        results.errors.push({ row: rowNum, message: error.message || "An unexpected error occurred during processing." });
        res.status(500).json({ message: "Failed to process Excel file.", ...results });
    }
});


// --- DELETE Student Elective Choice by ID ---
// Access: Admin Only
router.delete('/:id', authorize(UserRole.Admin), async (req, res, next) => {
    const { id } = req.params;
    const choiceId = parseInt(id);
    if (isNaN(choiceId)) return res.status(400).json({ message: 'Invalid ID for elective choice.' });
    try {
        await prisma.studentElectiveChoice.delete({ where: { id: choiceId } });
        res.status(200).json({ message: 'Elective choice deleted successfully.' });
    } catch (error) {
        console.error("Delete Elective Choice Error:", error);
        if (error.code === 'P2025') return res.status(404).json({ message: `Elective choice with ID ${choiceId} not found.` });
        next(error);
    }
});

export default router;
