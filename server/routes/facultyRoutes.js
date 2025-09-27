// File: server/routes/facultyRoutes.js
import express from 'express';
import { PrismaClient, UserRole, FacultyDesignation } from '@prisma/client';
import { protect, authorize } from '../middleware/authMiddleware.js';
import multer from 'multer';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware for all faculty routes
router.use(protect);

// --- GET Unlinked Users with 'Faculty' Role (Still useful for future linking) ---
router.get('/linkable-users', authorize(UserRole.Admin), async (req, res, next) => {
    try {
        const linkedUserIds = await prisma.faculty.findMany({
            where: { userId: { not: null } }, // Only consider faculty that have a userId
            select: { userId: true },
        });
        const idsToExclude = linkedUserIds.map(f => f.userId);

        const linkableUsers = await prisma.user.findMany({
            where: {
                role: UserRole.Faculty,
                id: { notIn: idsToExclude },
            },
            select: { id: true, email: true },
            orderBy: { email: 'asc' },
        });
        res.status(200).json(linkableUsers);
    } catch (error) {
        console.error("Get Linkable Faculty Users Error:", error);
        next(error);
    }
});

// --- POST Create New Faculty Record ---
// userId is now optional for creation to simplify development without pre-creating user accounts.
// uniqueId, departmentId, and designation are now MANDATORY.
router.post('/', authorize(UserRole.Admin), async (req, res, next) => {
    // userId is removed from here as it's now optional for initial creation
    const { name, uniqueId, departmentId, designation, userId } = req.body;

    // --- Validation ---
    if (!name || !uniqueId || !departmentId || !designation) {
        return res.status(400).json({ message: 'Full Name, Unique ID, Department, and Designation are required.' });
    }
    if (!Object.values(FacultyDesignation).includes(designation)) {
        return res.status(400).json({ message: 'Invalid designation provided.' });
    }
    const departmentIdNum = parseInt(departmentId);
    if (isNaN(departmentIdNum)) {
        return res.status(400).json({ message: 'Invalid Department ID format.' });
    }
    let userIdNum = null; // Default to null if not provided or invalid
    if (userId !== undefined && userId !== null && userId !== '') {
        userIdNum = parseInt(userId);
        if (isNaN(userIdNum)) {
            return res.status(400).json({ message: 'Invalid User ID format if provided.' });
        }
    }

    try {
        // Check if department exists
        const departmentExists = await prisma.department.findUnique({ where: { id: departmentIdNum } });
        if (!departmentExists) {
            return res.status(404).json({ message: `Department with ID ${departmentIdNum} not found.` });
        }

        // Check if uniqueId is actually unique
        const existingFacultyWithUniqueId = await prisma.faculty.findUnique({ where: { uniqueId: String(uniqueId).trim() } });
        if (existingFacultyWithUniqueId) {
            return res.status(409).json({ message: `Faculty with Unique ID '${uniqueId}' already exists.` });
        }
        
        // If userId is provided, check user validity (optional step now)
        if (userIdNum) {
            const userToLink = await prisma.user.findUnique({ where: { id: userIdNum } });
            if (!userToLink) {
                return res.status(404).json({ message: `User with ID ${userIdNum} not found (if provided for linking).` });
            }
            if (userToLink.role !== UserRole.Faculty) {
                return res.status(400).json({ message: `User ${userToLink.email} does not have the 'Faculty' role (if provided for linking).` });
            }
            const existingFacultyForUser = await prisma.faculty.findUnique({ where: { userId: userIdNum } });
            if (existingFacultyForUser) {
                return res.status(409).json({ message: `User ${userToLink.email} is already linked to another faculty record.` });
            }
        }


        const newFaculty = await prisma.faculty.create({
            data: {
                name: String(name).trim(),
                uniqueId: String(uniqueId).trim(), // Now mandatory
                departmentId: departmentIdNum,      // Now mandatory
                designation: designation,           // Now mandatory
                userId: userIdNum, // Will be null if not provided, making the link optional for now
            },
            include: {
                user: { select: { email: true, role: true } },
                department: { select: { id: true, name: true } },
            },
        });
        res.status(201).json({ message: 'Faculty record created successfully.', faculty: newFaculty });
    } catch (error) {
        console.error("Create Faculty Error:", error);
        if (error.code === 'P2002' && error.meta?.target?.includes('uniqueId')) {
            return res.status(409).json({ message: `Faculty with Unique ID '${uniqueId}' already exists.` });
        }
        // P2003 can happen if departmentId is somehow invalid despite check (race condition etc.)
        // or if a non-nullable field constraint is violated (though all mandatory fields are checked).
        if (error.code === 'P2003' && error.meta?.field_name?.includes('departmentId')) {
            return res.status(400).json({ message: `Invalid department specified.` });
        }
        next(error);
    }
});

// --- GET All Faculty Records ---
// Added departmentId filter for department-scoped viewing
router.get('/', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { name, departmentId, designation, uniqueId } = req.query; // departmentId from query
    const where = {};

    if (name) where.name = { contains: name, mode: 'insensitive' };
    if (uniqueId) where.uniqueId = { contains: uniqueId, mode: 'insensitive' };
    
    // If departmentId is provided in query, filter by it
    if (departmentId) {
        const deptIdNum = parseInt(departmentId);
        if (!isNaN(deptIdNum)) {
            where.departmentId = deptIdNum;
        } else {
            // Optionally handle invalid departmentId query param, or let it fetch all if invalid
            console.warn("Invalid departmentId in query for GET /faculty:", departmentId);
        }
    }

    if (designation && Object.values(FacultyDesignation).includes(designation)) {
        where.designation = designation;
    }

    try {
        const facultyMembers = await prisma.faculty.findMany({
            where,
            include: {
                user: { select: { id: true, email: true, role: true } },
                department: { select: { id: true, name: true } },
            },
            orderBy: { name: 'asc' },
        });
        res.status(200).json(facultyMembers);
    } catch (error) {
        console.error("Get Faculty List Error:", error);
        next(error);
    }
});

// --- GET Single Faculty Record by ID ---
router.get('/:id', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { id } = req.params;
    const facultyId = parseInt(id);
    if (isNaN(facultyId)) {
        return res.status(400).json({ message: 'Invalid Faculty ID format.' });
    }
    try {
        const faculty = await prisma.faculty.findUnique({
            where: { id: facultyId },
            include: {
                user: { select: { id: true, email: true, role: true } },
                department: { select: { id: true, name: true } },
            },
        });
        if (!faculty) {
            return res.status(404).json({ message: `Faculty with ID ${facultyId} not found.` });
        }
        res.status(200).json(faculty);
    } catch (error) {
        console.error("Get Faculty by ID Error:", error);
        next(error);
    }
});

// --- PUT Update Faculty Record ---
// uniqueId, departmentId, designation are now expected if being updated (or to maintain their value)
router.put('/:id', authorize(UserRole.Admin), async (req, res, next) => {
    const { id } = req.params;
    const facultyId = parseInt(id);
    if (isNaN(facultyId)) {
        return res.status(400).json({ message: 'Invalid Faculty ID format.' });
    }

    const { name, uniqueId, departmentId, designation, userId } = req.body;
    const updateData = {};

    // Fetch current faculty to ensure mandatory fields are not accidentally nulled if not provided in payload
    const currentFaculty = await prisma.faculty.findUnique({ where: { id: facultyId }});
    if (!currentFaculty) {
        return res.status(404).json({ message: `Faculty with ID ${facultyId} not found.`});
    }

    if (name !== undefined) updateData.name = String(name).trim();
    
    // Unique ID is mandatory, so if provided, it must be valid. If not provided, keep current.
    if (uniqueId !== undefined) {
        if (!String(uniqueId).trim()) return res.status(400).json({ message: "Unique ID cannot be empty."});
        updateData.uniqueId = String(uniqueId).trim();
    } else {
        updateData.uniqueId = currentFaculty.uniqueId; // Keep current if not provided
    }
    
    // Department ID is mandatory
    if (departmentId !== undefined) {
        const deptIdNum = parseInt(departmentId);
        if (isNaN(deptIdNum)) return res.status(400).json({ message: 'Invalid Department ID format.' });
        const departmentExists = await prisma.department.findUnique({ where: { id: deptIdNum }});
        if (!departmentExists) return res.status(404).json({ message: `Department with ID ${deptIdNum} not found.`});
        updateData.departmentId = deptIdNum;
    } else {
        updateData.departmentId = currentFaculty.departmentId; // Keep current if not provided
    }

    // Designation is mandatory
    if (designation !== undefined) {
        if (!Object.values(FacultyDesignation).includes(designation)) {
            return res.status(400).json({ message: 'Invalid designation provided.' });
        }
        updateData.designation = designation;
    } else {
        updateData.designation = currentFaculty.designation; // Keep current if not provided
    }

    // Handle userId update (linking/unlinking/changing link)
    if (userId !== undefined) { // Allows explicitly setting to null to unlink
        if (userId === null || userId === '') {
            updateData.userId = null;
        } else {
            const userIdNum = parseInt(userId);
            if (isNaN(userIdNum)) return res.status(400).json({ message: 'Invalid User ID format for linking.' });
            
            const userToLink = await prisma.user.findUnique({ where: { id: userIdNum } });
            if (!userToLink) return res.status(404).json({ message: `User with ID ${userIdNum} not found for linking.` });
            if (userToLink.role !== UserRole.Faculty) return res.status(400).json({ message: `User ${userToLink.email} does not have 'Faculty' role.` });

            // Check if this user is already linked to ANOTHER faculty record
            const existingLink = await prisma.faculty.findFirst({ where: { userId: userIdNum, id: { not: facultyId } } });
            if (existingLink) return res.status(409).json({ message: `User ${userToLink.email} is already linked to another faculty (ID: ${existingLink.id}).` });
            
            updateData.userId = userIdNum;
        }
    }
    
    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'No actual update data provided.' });
    }

    try {
        // Check uniqueId conflict before update if it's being changed
        if (updateData.uniqueId && updateData.uniqueId !== currentFaculty.uniqueId) {
            const existingFacultyWithUniqueId = await prisma.faculty.findUnique({
                where: { uniqueId: updateData.uniqueId },
            });
            if (existingFacultyWithUniqueId) { // No need to check existingFacultyWithUniqueId.id !== facultyId because uniqueId is @unique
                return res.status(409).json({ message: `Faculty with Unique ID '${updateData.uniqueId}' already exists.` });
            }
        }

        const updatedFaculty = await prisma.faculty.update({
            where: { id: facultyId },
            data: updateData,
            include: {
                user: { select: { email: true, role: true } },
                department: { select: { id: true, name: true } },
            },
        });
        res.status(200).json({ message: 'Faculty record updated successfully.', faculty: updatedFaculty });
    } catch (error) {
        console.error("Update Faculty Error:", error);
        if (error.code === 'P2025') { // Should be caught by initial currentFaculty check
            return res.status(404).json({ message: `Faculty with ID ${facultyId} not found.` });
        }
        if (error.code === 'P2002' && error.meta?.target?.includes('uniqueId')) {
            return res.status(409).json({ message: `Faculty with Unique ID '${updateData.uniqueId}' already exists.` });
        }
        next(error);
    }
});

// --- DELETE Faculty Record ---
router.delete('/:id', authorize(UserRole.Admin), async (req, res, next) => {
    const { id } = req.params;
    const facultyId = parseInt(id);
    if (isNaN(facultyId)) {
        return res.status(400).json({ message: 'Invalid Faculty ID format.' });
    }
    try {
        await prisma.faculty.delete({
            where: { id: facultyId },
        });
        res.status(200).json({ message: `Faculty record for ID ${facultyId} deleted successfully.` });
    } catch (error) {
        console.error("Delete Faculty Error:", error);
        if (error.code === 'P2025') {
            return res.status(404).json({ message: `Faculty with ID ${facultyId} not found.` });
        }
        // P2003: Foreign key constraint failed. This might happen if onDelete: Restrict is used on related models
        // and there are still references (e.g., LoadAllocations if its onDelete was Restrict for facultyId).
        // Our schema currently uses Cascade for LoadAllocation on facultyId, so this is less likely for that.
        if (error.code === 'P2003') {
            return res.status(409).json({ message: `Cannot delete faculty ID ${facultyId} due to existing references in other records (e.g., load allocations, timetable slots). Please remove these references first.` });
        }
        next(error);
    }
});

// --- POST Bulk Upload Faculty Records ---
router.post('/upload', authorize(UserRole.Admin), upload.single('file'), async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }
    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    let rawData = [];

    try {
        const transformHeader = header => String(header).toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '');

        if (fileName.endsWith('.csv')) {
            const csvString = fileBuffer.toString('utf8');
            const parsed = Papa.parse(csvString, { header: true, skipEmptyLines: true, transformHeader });
            if (parsed.errors.length) return res.status(400).json({ message: 'Error parsing CSV.', errors: parsed.errors });
            rawData = parsed.data;
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonDataAsArray = XLSX.utils.sheet_to_json(worksheet, { defval: null, header: 1 });
            if (jsonDataAsArray.length === 0) return res.status(400).json({ message: 'Excel sheet is empty.' });
            const headers = jsonDataAsArray[0].map(transformHeader);
            rawData = jsonDataAsArray.slice(1).map(arr => headers.reduce((obj, header, i) => ({ ...obj, [header]: arr[i] }), {}));
        } else {
            return res.status(400).json({ message: 'Unsupported file type. Use CSV or Excel.' });
        }

        if (!rawData || rawData.length === 0) {
            return res.status(400).json({ message: 'File is empty or has no data rows.' });
        }

        const results = { createdCount: 0, errors: [] };
        const departments = await prisma.department.findMany({ select: { id: true, name: true } });
        const departmentMap = new Map(departments.map(d => [String(d.name).toLowerCase().trim(), d.id]));
        const existingUniqueIds = new Set((await prisma.faculty.findMany({ select: { uniqueId: true } })).map(f => f.uniqueId));
        // For optional user linking during upload:
        // const existingUserEmails = new Map((await prisma.user.findMany({where: {role: UserRole.Faculty}, select:{id:true, email:true}})).map(u => [u.email.toLowerCase(), u.id]));
        // const linkedUserIds = new Set((await prisma.faculty.findMany({where: {userId: {not: null}}, select:{userId:true}})).map(f => f.userId));


        for (let i = 0; i < rawData.length; i++) {
            const row = rawData[i];
            const rowIndex = i + 2;

            const name = row['name'] || row['fullname'];
            const uniqueId = row['uniqueid'] || row['facultyid'] || row['id'];
            const departmentName = row['department'] || row['departmentname'];
            const designation = row['designation'];
            // const userEmailToLink = row['useremail'] || row['email']; // For optional linking

            if (!name || !uniqueId || !departmentName || !designation) {
                results.errors.push({ row: rowIndex, uniqueId: uniqueId || 'N/A', message: 'Missing required fields: Name, Unique ID, Department, Designation.' });
                continue;
            }
            const trimmedUniqueId = String(uniqueId).trim();
            if (existingUniqueIds.has(trimmedUniqueId)) {
                results.errors.push({ row: rowIndex, uniqueId: trimmedUniqueId, message: `Unique ID '${trimmedUniqueId}' already exists.` });
                continue;
            }
            const deptId = departmentMap.get(String(departmentName).toLowerCase().trim());
            if (!deptId) {
                results.errors.push({ row: rowIndex, uniqueId: trimmedUniqueId, message: `Department '${departmentName}' not found.` });
                continue;
            }
            if (!Object.values(FacultyDesignation).includes(String(designation))) {
                results.errors.push({ row: rowIndex, uniqueId: trimmedUniqueId, message: `Invalid designation '${designation}'. Allowed: ${Object.values(FacultyDesignation).join(', ')}.` });
                continue;
            }
            
            // Temporarily, userId linking via CSV is disabled.
            // If you want to enable it, uncomment and adapt the userEmailToLink logic
            let facultyUserId = null;
            /*
            if (userEmailToLink) {
                const emailLower = String(userEmailToLink).toLowerCase().trim();
                if (existingUserEmails.has(emailLower)) {
                    const potentialUserId = existingUserEmails.get(emailLower);
                    if (!linkedUserIds.has(potentialUserId)) {
                        facultyUserId = potentialUserId;
                    } else {
                        results.errors.push({ row: rowIndex, uniqueId: trimmedUniqueId, message: `User email '${userEmailToLink}' is already linked to another faculty.` });
                        continue;
                    }
                } else {
                    results.errors.push({ row: rowIndex, uniqueId: trimmedUniqueId, message: `User email '${userEmailToLink}' not found or not a Faculty role.` });
                    continue;
                }
            }
            */

            const facultyData = {
                name: String(name).trim(),
                uniqueId: trimmedUniqueId,
                departmentId: deptId,
                designation: String(designation),
                userId: facultyUserId, // Will be null for now
            };

            try {
                await prisma.faculty.create({ data: facultyData });
                results.createdCount++;
                existingUniqueIds.add(trimmedUniqueId);
                // if (facultyUserId) linkedUserIds.add(facultyUserId);
            } catch (dbError) {
                results.errors.push({ row: rowIndex, uniqueId: trimmedUniqueId, message: `DB error: ${dbError.message}` });
            }
        }
        const status = results.errors.length > 0 ? (results.createdCount > 0 ? 207 : 400) : 201;
        res.status(status).json({ message: `Faculty upload: ${results.createdCount} created, ${results.errors.length} errors.`, ...results });

    } catch (error) {
        console.error("Faculty File Upload Error:", error);
        res.status(500).json({ message: error.message || "Error processing faculty file." });
    }
});


export default router;
