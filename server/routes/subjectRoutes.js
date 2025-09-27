// File: server/routes/subjectRoutes.js
import express from 'express';
import { PrismaClient, SubjectType } from '@prisma/client';
import { protect, authorize } from '../middleware/authMiddleware.js';
import multer from 'multer';
// Papa and XLSX are for file upload, not directly changed for courseGroup logic
// import Papa from 'papaparse';
// import * as XLSX from 'xlsx';

const prisma = new PrismaClient();
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // For file uploads

router.use(protect);

// Helper function to calculate semester number (1-8) from academic year level (1-4) and semester type (odd/even)
const calculateSemester = (year, semesterType) => {
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) {
        throw new Error('Invalid year. Must be between 1 (FE) and 4 (BE).');
    }
    const semTypeLower = String(semesterType).toLowerCase();
    if (semTypeLower === 'odd') {
        return yearNum * 2 - 1;
    } else if (semTypeLower === 'even') {
        return yearNum * 2;
    }
    throw new Error("Invalid semester type. Must be 'odd' or 'even'.");
};

// --- GET All Subjects (with filtering and sorting) ---
// CORRECTED: Removed redundant 'include' when 'select' is used.
router.get('/', authorize('Admin', 'Faculty'), async (req, res, next) => {
    const {
        departmentId, year, semester, subjectType, courseCategory, code, name,
        courseGroup, 
        sortBy, order
    } = req.query;
    const where = {};

    if (departmentId) where.departmentId = parseInt(departmentId);
    if (year) where.year = parseInt(year);
    if (semester) where.semester = parseInt(semester);
    if (subjectType && Object.values(SubjectType).includes(subjectType)) where.subjectType = subjectType;
    if (courseCategory) where.courseCategory = { contains: courseCategory, mode: 'insensitive' };
    if (code) where.code = { contains: code, mode: 'insensitive' };
    if (name) where.name = { contains: name, mode: 'insensitive' };
    if (courseGroup) where.courseGroup = { contains: courseGroup, mode: 'insensitive' };

    let orderBy = [];
    if (sortBy) {
        const allowedSortFields = ['code', 'name', 'year', 'semester', 'subjectType', 'courseCategory', 'courseGroup'];
        if (allowedSortFields.includes(sortBy)) {
            orderBy.push({ [sortBy]: order === 'desc' ? 'desc' : 'asc' });
        } else {
            orderBy.push({ year: 'asc' }, { semester: 'asc' }, { code: 'asc' }); // Default sort
        }
    } else {
        orderBy.push({ year: 'asc' }, { semester: 'asc' }, { code: 'asc' }); // Default sort
    }
    if (!orderBy.find(o => o.id)) { 
        orderBy.push({ id: 'asc' });
    }

    try {
        const subjects = await prisma.subject.findMany({
            where,
            select: { // Using 'select' to specify all fields and relations needed
                id: true,
                code: true,
                name: true,
                departmentId: true,
                year: true,
                semester: true,
                subjectType: true,
                courseGroup: true, // Included courseGroup
                courseCategory: true,
                theoryHours: true,
                practicalHours: true,
                labRequirements: true,
                createdAt: true,
                updatedAt: true,
                avgStudentsPerDivision: true,
                avgStudentsPerBatch: true,
                department: { // Selecting specific fields from the related department
                    select: {
                        id: true,
                        name: true
                    }
                },
                // syllabi: true, // Example: If you need syllabi, add its select block here or set to true
                // loadAllocations: true,
                // timetableSlots: true,
                // studentElectiveChoices: true,
            },
            orderBy: orderBy,
        });
        res.status(200).json(subjects);
    } catch (error) {
        console.error("Get Subjects Error:", error);
        next(error); // Pass error to global error handler
    }
});

// --- GET Subject by ID ---
router.get('/:id', authorize('Admin', 'Faculty'), async (req, res, next) => {
    const { id } = req.params;
    const subjectId = parseInt(id);
    if (isNaN(subjectId)) {
        return res.status(400).json({ message: 'Invalid Subject ID format.'});
    }
    try {
        const subject = await prisma.subject.findUnique({
            where: { id: subjectId },
            select: { 
                id: true, code: true, name: true, departmentId: true, year: true, semester: true,
                subjectType: true, courseGroup: true, courseCategory: true, theoryHours: true, practicalHours: true,
                labRequirements: true, createdAt: true, updatedAt: true, avgStudentsPerDivision: true, avgStudentsPerBatch: true,
                department: { select: { id: true, name: true } },
            }
        });
        if (!subject) {
            return res.status(404).json({ message: `Subject with ID ${id} not found.` });
        }
        res.status(200).json(subject);
    } catch (error) {
        console.error("Get Subject by ID Error:", error);
        next(error);
    }
});

// --- POST Create New Subject (SINGLE) ---
router.post('/', authorize('Admin'), async (req, res, next) => {
    let {
        code, name, departmentId, year, semesterType,
        subjectType, courseGroup, 
        courseCategory, theoryHours, practicalHours, labRequirements
    } = req.body;

    if (!code || !name || departmentId === undefined || year === undefined || !semesterType || !subjectType) {
        return res.status(400).json({ message: 'Code, Name, Department, Year, Semester Type, and Subject Type are required.' });
    }
    const yearNum = parseInt(year);
    const deptIdNum = parseInt(departmentId);

    if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) {
        return res.status(400).json({ message: 'Invalid Year. Must be 1-4.' });
    }
    if (isNaN(deptIdNum)) {
        return res.status(400).json({ message: "Invalid Department ID."});
    }
    if (!Object.values(SubjectType).includes(subjectType)) { 
        return res.status(400).json({ message: `Invalid Subject Type. Allowed: ${Object.values(SubjectType).join(', ')}` });
    }
    
    let semester;
    try {
        semester = calculateSemester(yearNum, semesterType);
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }

    const thHours = theoryHours !== undefined ? parseInt(theoryHours) : 0;
    const prHours = practicalHours !== undefined ? parseInt(practicalHours) : 0;
    if (isNaN(thHours) || thHours < 0 || isNaN(prHours) || prHours < 0) {
        return res.status(400).json({ message: "Theory and Practical hours must be non-negative numbers."});
    }
    const finalLabRequirements = Array.isArray(labRequirements) 
        ? labRequirements.map(String).filter(lr => lr.trim() !== "") 
        : (labRequirements ? String(labRequirements).split(',').map(s => s.trim()).filter(s => s) : []);
    
    const finalCourseGroup = courseGroup ? String(courseGroup).trim() : null;

    try {
        const departmentExists = await prisma.department.findUnique({ where: { id: deptIdNum } });
        if (!departmentExists) {
            return res.status(404).json({ message: `Department with ID ${departmentId} not found.` });
        }

        const newSubject = await prisma.subject.create({
            data: {
                code: String(code).trim(),
                name: String(name).trim(),
                departmentId: deptIdNum,
                year: yearNum,
                semester: semester, 
                subjectType: subjectType,
                courseGroup: finalCourseGroup,
                courseCategory: courseCategory ? String(courseCategory).trim() : null,
                theoryHours: thHours,
                practicalHours: prHours,
                labRequirements: finalLabRequirements
            },
            include: { department: true } // Keep include here for the response of single create
        });
        res.status(201).json({ message: 'Subject created successfully.', subject: newSubject });
    } catch (error) {
        console.error("Create Subject Error:", error);
        if (error.code === 'P2002' && error.meta?.target?.includes('code')) {
            return res.status(409).json({ message: `Subject code '${code}' already exists.` });
        }
        next(error);
    }
});

// --- POST Batch Create Subjects (Admin Only) ---
router.post('/batch-create', authorize('Admin'), async (req, res, next) => {
    console.log(`[SubjectRoutes /batch-create] Received request.`);
    const { subjects: subjectsToCreate } = req.body;

    if (!Array.isArray(subjectsToCreate) || subjectsToCreate.length === 0) {
        return res.status(400).json({ message: 'Subjects data must be a non-empty array.' });
    }

    const createdSubjects = [];
    const errors = [];
    const departmentIds = [...new Set(subjectsToCreate.map(s => s.departmentId).filter(id => id != null))];
    if (departmentIds.length > 0) {
        const existingDepartments = await prisma.department.findMany({
            where: { id: { in: departmentIds.map(id => parseInt(id)) } },
            select: { id: true }
        });
        const existingDepartmentIds = new Set(existingDepartments.map(d => d.id));
        for (const deptId of departmentIds) {
            if (!existingDepartmentIds.has(parseInt(deptId))) {
                return res.status(400).json({ message: `Invalid input: Department with ID ${deptId} does not exist.` });
            }
        }
    }
    
    const allExistingCodes = new Set((await prisma.subject.findMany({ select: { code: true } })).map(s => s.code));

    try {
        await prisma.$transaction(async (tx) => {
            for (let i = 0; i < subjectsToCreate.length; i++) {
                const subjectData = subjectsToCreate[i];
                const {
                    code, name, departmentId, year, semester, 
                    subjectType, courseGroup, courseCategory, 
                    theoryHours, practicalHours, labRequirements
                } = subjectData;

                if (!code || !name || departmentId === undefined || year === undefined || semester === undefined || !subjectType) {
                    errors.push({ index: i, code, message: 'Missing required fields.' }); continue; 
                }
                const yearNum = parseInt(year); const deptIdNum = parseInt(departmentId); const semesterNum = parseInt(semester);

                if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) { errors.push({ index: i, code, message: 'Invalid Year.' }); continue; }
                if (isNaN(semesterNum) || semesterNum < 1 || semesterNum > 8) { errors.push({ index: i, code, message: 'Invalid Semester.' }); continue; }
                if (isNaN(deptIdNum)) { errors.push({ index: i, code, message: 'Invalid Department ID.' }); continue; }
                if (!Object.values(SubjectType).includes(subjectType)) { errors.push({ index: i, code, message: 'Invalid Subject Type.' }); continue; }
                const trimmedCode = String(code).trim();
                if (allExistingCodes.has(trimmedCode)) { errors.push({ index: i, code, message: `Code '${trimmedCode}' already exists.` }); continue; }

                const thHours = theoryHours !== undefined ? parseInt(theoryHours) : 0;
                const prHours = practicalHours !== undefined ? parseInt(practicalHours) : 0;
                if (isNaN(thHours) || thHours < 0) { errors.push({ index: i, code, message: "Theory hours non-negative."}); continue; }
                if (isNaN(prHours) || prHours < 0) { errors.push({ index: i, code, message: "Practical hours non-negative."}); continue; }
                const finalLabRequirements = Array.isArray(labRequirements) ? labRequirements.map(String).filter(lr => lr.trim() !== "") : [];
                const finalCourseGroup = courseGroup ? String(courseGroup).trim() : null;

                const newSubject = await tx.subject.create({
                    data: {
                        code: trimmedCode, name: String(name).trim(), departmentId: deptIdNum,
                        year: yearNum, semester: semesterNum, subjectType: subjectType,
                        courseGroup: finalCourseGroup, 
                        courseCategory: courseCategory ? String(courseCategory).trim() : null,
                        theoryHours: thHours, practicalHours: prHours, labRequirements: finalLabRequirements,
                    },
                    include: { department: {select: {name: true}} }
                });
                createdSubjects.push(newSubject);
                allExistingCodes.add(newSubject.code);
            }
            if (errors.length > 0) {
                throw new Error(`Validation errors occurred for ${errors.length} subject(s).`);
            }
        });
        res.status(201).json({ message: `Successfully created ${createdSubjects.length} subjects.`, createdSubjects });
    } catch (error) {
        console.error("[SubjectRoutes /batch-create] Error:", error);
        if (error.message.startsWith("Validation errors occurred")) {
            return res.status(400).json({ message: "Batch creation failed.", errors: errors });
        }
        if (error.code === 'P2002') {
             return res.status(409).json({ message: `One or more subject codes already exist. Rolled back.` });
        }
        next(error);
    }
});

// --- PUT Update Subject (Admin Only) ---
router.put('/:id', authorize('Admin'), async (req, res, next) => {
    const { id } = req.params;
    const subjectId = parseInt(id);
     if (isNaN(subjectId)) {
        return res.status(400).json({ message: 'Invalid Subject ID format.' });
    }
    let { 
        code, name, departmentId, year, semesterType, 
        subjectType, courseGroup, courseCategory, 
        theoryHours, practicalHours, labRequirements
    } = req.body;

    const updateData = {};
    const currentSubject = await prisma.subject.findUnique({ where: { id: subjectId } });
    if (!currentSubject) {
        return res.status(404).json({ message: `Subject with ID ${id} not found.` });
    }

    if (code !== undefined) updateData.code = String(code).trim();
    if (name !== undefined) updateData.name = String(name).trim();
    if (departmentId !== undefined) {
        const deptIdNum = parseInt(departmentId);
        if (isNaN(deptIdNum)) return res.status(400).json({ message: 'Invalid Department ID.' });
        const departmentExists = await prisma.department.findUnique({ where: { id: deptIdNum } });
        if (!departmentExists) return res.status(404).json({ message: `Department with ID ${deptIdNum} not found.` });
        updateData.departmentId = deptIdNum;
    }

    const yearForCalc = year !== undefined ? parseInt(year) : currentSubject.year;
    const semTypeForCalc = semesterType !== undefined ? semesterType : (currentSubject.semester % 2 === 0 ? 'even' : 'odd');

    if (year !== undefined || semesterType !== undefined) { 
        if (isNaN(yearForCalc) || yearForCalc < 1 || yearForCalc > 4) {
            return res.status(400).json({ message: 'Invalid Year for semester calculation.' });
        }
        try {
            updateData.year = yearForCalc;
            updateData.semester = calculateSemester(yearForCalc, semTypeForCalc);
        } catch (e) { return res.status(400).json({ message: e.message }); }
    }

    if (subjectType !== undefined) {
        if (!Object.values(SubjectType).includes(subjectType)) return res.status(400).json({ message: 'Invalid Subject Type.' });
        updateData.subjectType = subjectType;
    }
    if (courseGroup !== undefined) updateData.courseGroup = courseGroup ? String(courseGroup).trim() : null;
    if (courseCategory !== undefined) updateData.courseCategory = courseCategory ? String(courseCategory).trim() : null;
    if (theoryHours !== undefined) {
        const th = parseInt(theoryHours);
        if (isNaN(th) || th < 0) return res.status(400).json({message: "Theory hours non-negative."});
        updateData.theoryHours = th;
    }
    if (practicalHours !== undefined) {
        const ph = parseInt(practicalHours);
        if (isNaN(ph) || ph < 0) return res.status(400).json({message: "Practical hours non-negative."});
        updateData.practicalHours = ph;
    }
    if (labRequirements !== undefined) {
        updateData.labRequirements = Array.isArray(labRequirements) 
            ? labRequirements.map(String).filter(lr => lr.trim() !== "") 
            : (typeof labRequirements === 'string' ? String(labRequirements).split(',').map(s => s.trim()).filter(s => s) : []);
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'No update data provided.' });
    }

    try {
        if (updateData.code && updateData.code !== currentSubject.code) {
            const existingSubjectWithCode = await prisma.subject.findUnique({ where: { code: updateData.code } });
            if (existingSubjectWithCode) {
                return res.status(409).json({ message: `Subject code '${updateData.code}' already exists.` });
            }
        }
        const updatedSubject = await prisma.subject.update({
            where: { id: subjectId }, data: updateData, include: { department: true }
        });
        res.status(200).json({ message: 'Subject updated successfully.', subject: updatedSubject });
    } catch (error) {
        console.error("Update Subject Error:", error);
        if (error.code === 'P2025') return res.status(404).json({ message: `Subject with ID ${id} not found.` });
        if (error.code === 'P2002') return res.status(409).json({ message: `Subject code '${updateData.code}' already exists.` });
        next(error);
    }
});

// --- DELETE Subject (Admin Only) ---
router.delete('/:id', authorize('Admin'), async (req, res, next) => {
    const { id } = req.params;
    const subjectId = parseInt(id);
     if (isNaN(subjectId)) {
        return res.status(400).json({ message: 'Invalid Subject ID format.' });
    }
    try {
        const loadAllocationsCount = await prisma.loadAllocation.count({ where: { subjectId: subjectId }});
        const timetableSlotsCount = await prisma.timetableSlot.count({ where: { subjectId: subjectId }});
        const syllabusCount = await prisma.syllabus.count({ where: { subjectId: subjectId }});
        const studentChoicesCount = await prisma.studentElectiveChoice.count({ where: { subjectId: subjectId }});

        if (loadAllocationsCount > 0 || timetableSlotsCount > 0 || syllabusCount > 0 || studentChoicesCount > 0) {
            let relatedMessages = [];
            if (loadAllocationsCount > 0) relatedMessages.push("load allocations");
            if (timetableSlotsCount > 0) relatedMessages.push("timetable slots");
            if (syllabusCount > 0) relatedMessages.push("syllabus entries");
            if (studentChoicesCount > 0) relatedMessages.push("student elective choices");
            return res.status(409).json({ message: `Cannot delete subject. Associated with ${relatedMessages.join(', ')}.`});
        }
        await prisma.subject.delete({ where: { id: subjectId } });
        res.status(200).json({ message: `Subject with ID ${id} deleted successfully.` });
    } catch (error) {
        console.error("Delete Subject Error:", error);
        if (error.code === 'P2025') return res.status(404).json({ message: `Subject with ID ${id} not found.` });
        next(error);
    }
});

// --- POST Bulk Upload Subjects (Admin Only) ---
router.post('/upload', authorize('Admin'), upload.single('file'), async (req, res, next) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });
    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    let rawData = [];

    try {
        const transformHeader = header => String(header).toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '');
        if (fileName.endsWith('.csv')) {
            const Papa = await import('papaparse').then(m => m.default || m); // Dynamic import
            const parsed = Papa.parse(fileBuffer.toString('utf8'), { header: true, skipEmptyLines: true, transformHeader });
            if (parsed.errors.length) return res.status(400).json({ message: 'Error parsing CSV.', errors: parsed.errors.map(e=>e.message) });
            rawData = parsed.data;
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            const XLSX = await import('xlsx').then(m => m.default || m); // Dynamic import
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonDataAsArray = XLSX.utils.sheet_to_json(worksheet, { defval: null, header:1 });
            if (jsonDataAsArray.length === 0) return res.status(400).json({ message: 'Excel sheet empty.' });
            const headers = jsonDataAsArray[0].map(transformHeader);
            rawData = jsonDataAsArray.slice(1).map(arr => headers.reduce((obj, h, i) => ({ ...obj, [h]: arr[i] }), {}));
        } else {
            return res.status(400).json({ message: 'Unsupported file type.' });
        }

        if (!rawData || rawData.length === 0) return res.status(400).json({ message: 'No data rows.' });

        const results = { createdCount: 0, errors: [] };
        const departmentsFromDB = await prisma.department.findMany({ select: { id: true, name: true } });
        const departmentMap = new Map(departmentsFromDB.map(d => [String(d.name).toLowerCase().trim(), d.id]));
        const existingSubjectCodes = new Set((await prisma.subject.findMany({select: {code: true}})).map(s => s.code));

        for (let i = 0; i < rawData.length; i++) {
            const row = rawData[i]; const rowIndex = i + 2;
            const { code, name, department, year: yearStr, semestertype, semester: directSemesterFromFile, 
                    type: subjectTypeFromFileAltern, subjecttype: subjectTypeFromFile, // Accept both 'type' and 'subjecttype'
                    coursegroup, coursecategory, theoryhours, practicalhours, labrequirements } = row;
            
            const finalSubjectTypeFromFile = subjectTypeFromFile || subjectTypeFromFileAltern;

            if (!code || !name || !department || !yearStr || !finalSubjectTypeFromFile) {
                results.errors.push({ row: rowIndex, subjectCode: code || 'N/A', message: 'Missing required fields.' }); continue;
            }
            let semester; const yearNum = parseInt(yearStr);
            if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) { results.errors.push({ row: rowIndex, subjectCode: code, message: `Invalid year.` }); continue; }
            if (directSemesterFromFile !== undefined && String(directSemesterFromFile).trim() !== '') {
                semester = parseInt(directSemesterFromFile);
                if (isNaN(semester) || semester < 1 || semester > 8) { results.errors.push({ row: rowIndex, subjectCode: code, message: `Invalid direct semester.` }); continue; }
                if ((yearNum * 2 < semester) || (yearNum * 2 - 1 > semester && yearNum * 2 !== semester) ) { results.errors.push({ row: rowIndex, subjectCode: code, message: `Semester/Year mismatch.` }); continue; }
            } else if (semestertype) {
                try { semester = calculateSemester(yearNum, semestertype); } catch (e) { results.errors.push({ row: rowIndex, subjectCode: code, message: e.message }); continue; }
            } else { results.errors.push({ row: rowIndex, subjectCode: code, message: `Missing semester info.` }); continue; }

            const trimmedCode = String(code).trim();
            if(existingSubjectCodes.has(trimmedCode)){ results.errors.push({ row: rowIndex, subjectCode: trimmedCode, message: `Code exists.` }); continue; }
            const finalSubjectType = String(finalSubjectTypeFromFile).trim();
            if (!Object.values(SubjectType).includes(finalSubjectType)) { results.errors.push({ row: rowIndex, subjectCode: trimmedCode, message: `Invalid type.` }); continue; }
            const deptId = departmentMap.get(String(department).toLowerCase().trim());
            if (!deptId) { results.errors.push({ row: rowIndex, subjectCode: trimmedCode, message: `Dept not found.` }); continue; }
            const th = parseInt(theoryhours || '0'); const ph = parseInt(practicalhours || '0');
            if (isNaN(th) || th < 0) { results.errors.push({ row: rowIndex, subjectCode: trimmedCode, message: `Invalid TH.` }); continue; }
            if (isNaN(ph) || ph < 0) { results.errors.push({ row: rowIndex, subjectCode: trimmedCode, message: `Invalid PH.` }); continue; }
            const lr = String(labrequirements || '').split(',').map(s => s.trim()).filter(s => s && s !== '-');
            const finalCourseGroup = coursegroup ? String(coursegroup).trim() : null;

            const subjectData = {
                code: trimmedCode, name: String(name).trim(), departmentId: deptId, year: yearNum, semester,
                subjectType: finalSubjectType, courseGroup: finalCourseGroup, 
                courseCategory: coursecategory ? String(coursecategory).trim() : null,
                theoryHours: th, practicalHours: ph, labRequirements: lr
            };
            try {
                await prisma.subject.create({ data: subjectData });
                results.createdCount++; existingSubjectCodes.add(trimmedCode);
            } catch (dbError) { results.errors.push({ row: rowIndex, subjectCode: subjectData.code, message: `DB error: ${dbError.message}` }); }
        }
        const status = results.errors.length > 0 ? (results.createdCount > 0 ? 207 : 400) : 201;
        res.status(status).json({ message: `Processed. ${results.createdCount} created.`, ...results });
    } catch (error) {
        console.error("File Upload General Error:", error);
        res.status(500).json({ message: error.message || "Error processing file." });
    }
});

export default router;
