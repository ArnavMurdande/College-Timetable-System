// File: server/routes/divisionRoutes.js
import express from 'express';
import { PrismaClient, UserRole, DivisionType, SubjectType } from '@prisma/client';
import { protect, authorize } from '../middleware/authMiddleware.js';

const prisma = new PrismaClient();
const router = express.Router();

router.use(protect);

// Helper function to calculate semester
const calculateSemester = (year, semesterType) => {
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) return null;
    const semTypeLower = String(semesterType).toLowerCase();
    if (semTypeLower === 'odd') return yearNum * 2 - 1;
    if (semTypeLower === 'even') return yearNum * 2;
    return null;
};

// --- Specific Literal Routes & More Specific Parameterized Routes FIRST ---

// GET Permanent Batches for Theory Composition of Temporary Divisions
router.get('/permanent-batches-for-composition', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { departmentId, year, semester } = req.query;
    if (!departmentId || !year || !semester) {
        return res.status(400).json({ message: "Department ID, Year, and Semester (number) are required." });
    }
    const deptIdNum = parseInt(departmentId);
    const yearNum = parseInt(year);
    const semesterNum = parseInt(semester);
    if (isNaN(deptIdNum) || isNaN(yearNum) || isNaN(semesterNum) || semesterNum < 1 || semesterNum > 8) {
        return res.status(400).json({ message: "Invalid Department ID, Year, or Semester format." });
    }
    try {
        const permanentDivisions = await prisma.division.findMany({
            where: {
                departmentId: deptIdNum, year: yearNum, semester: semesterNum,
                divisionType: DivisionType.Permanent,
                OR: [{ linkedSubjectType: SubjectType.Common }, { linkedSubjectType: null }]
            },
            include: {
                batches: {
                    select: { id: true, name: true, permanentDivision: { select: { id: true, name: true } } },
                    orderBy: { name: 'asc' }
                }
            },
            orderBy: { name: 'asc'}
        });
        const allBatches = permanentDivisions.flatMap(div => div.batches.map(b => ({
            id: b.id, name: b.name, divisionId: div.id, divisionName: div.name
        }))).sort((a,b) => {
            const divCompare = a.divisionName.localeCompare(b.divisionName);
            if (divCompare !== 0) return divCompare;
            return a.name.localeCompare(b.name);
        });
        res.status(200).json(allBatches);
    } catch (error) { next(error); }
});

// --- Custom Lab Group Set Routes ---
router.post('/custom-lab-group-sets', authorize(UserRole.Admin), async (req, res, next) => {
    const { departmentId, year, semesterType, linkedSubjectType, courseCategory, customLabBatches } = req.body;
    if (!departmentId || !year || !semesterType || !linkedSubjectType || !courseCategory) {
        return res.status(400).json({ message: "Department, Year, Semester Type, Linked Subject Type, and Course Category are required for a Custom Lab Group Set." });
    }
    const electiveTypesForCustomLabs = ['DLO', 'ILOT', 'MajorMinor'];
    if (!electiveTypesForCustomLabs.includes(linkedSubjectType)) {
        return res.status(400).json({ message: `Custom Lab Groups can only be linked to ${electiveTypesForCustomLabs.join(', ')} subject types.` });
    }
    if (!Array.isArray(customLabBatches) || customLabBatches.length === 0) {
        return res.status(400).json({ message: "At least one custom lab batch definition is required." });
    }
    for (const batchDef of customLabBatches) {
        if (!batchDef.name || !batchDef.name.trim() || !Array.isArray(batchDef.permanentBatchIds) || batchDef.permanentBatchIds.length === 0 || batchDef.permanentBatchIds.some(id => isNaN(parseInt(id)))) {
            return res.status(400).json({ message: "Each custom lab batch must have a valid name and be composed of at least one valid permanent batch ID." });
        }
    }
    const deptIdNum = parseInt(departmentId);
    const yearNum = parseInt(year);
    const semesterNum = calculateSemester(yearNum, semesterType);
    if (isNaN(deptIdNum) || isNaN(yearNum) || semesterNum === null) {
        return res.status(400).json({ message: "Invalid department, year, or semester type." });
    }
    try {
        const createdSet = await prisma.customLabGroupSet.create({
            data: {
                departmentId: deptIdNum, year: yearNum, semester: semesterNum,
                linkedSubjectType: linkedSubjectType, courseCategory: courseCategory.trim(),
                customLabBatches: {
                    create: customLabBatches.map(batchDef => ({
                        name: batchDef.name.trim(),
                        composedOfPermanentBatches: { connect: batchDef.permanentBatchIds.map(id => ({ id: parseInt(id) })) }
                    }))
                }
            },
            include: { department: true, customLabBatches: { include: { composedOfPermanentBatches: { select: { id: true, name: true, permanentDivision: {select: {id:true, name:true}}}}} } }
        });
        res.status(201).json({ message: "Custom Lab Group Set created successfully.", customLabGroupSet: createdSet });
    } catch (error) {
        if (error.code === 'P2002') return res.status(409).json({ message: "A Custom Lab Group Set for this exact Department, Year, Semester, Linked Subject Type, and Course Category already exists, or a custom lab batch name is not unique within this set." });
        if (error.code === 'P2025') return res.status(400).json({ message: 'Invalid reference: One or more selected permanent batch IDs for composition are invalid.' });
        next(error);
    }
});

router.get('/custom-lab-group-sets', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { departmentId, year, semesterType, linkedSubjectType, courseCategory } = req.query;
    const where = {};
    if (departmentId) { const id = parseInt(departmentId); if (!isNaN(id)) where.departmentId = id; }
    if (year && semesterType) {
        const yr = parseInt(year); const sem = calculateSemester(yr, semesterType);
        if (!isNaN(yr) && sem !== null) { where.year = yr; where.semester = sem; }
        else return res.status(200).json([]);
    } else if (year) { const yr = parseInt(year); if (!isNaN(yr)) where.year = yr; else return res.status(200).json([]); }
    if (linkedSubjectType && Object.values(SubjectType).includes(linkedSubjectType)) where.linkedSubjectType = linkedSubjectType; else if (linkedSubjectType) return res.status(200).json([]);
    if (courseCategory) where.courseCategory = { contains: courseCategory, mode: 'insensitive' };
    try {
        const sets = await prisma.customLabGroupSet.findMany({
            where, 
            include: {
                department: { select: { name: true } },
                customLabBatches: {
                    include: { composedOfPermanentBatches: { select: { id: true, name: true, permanentDivision: {select: {id:true, name:true}} } } },
                    orderBy: { name: 'asc' }
                }
            },
            orderBy: [{ department: { name: 'asc' } }, { year: 'asc' }, { semester: 'asc' }, { courseCategory: 'asc' }]
        });
        res.status(200).json(sets);
    } catch (error) { next(error); }
});

router.get('/custom-lab-group-sets/available-batches-for-set', authorize(UserRole.Admin), async (req, res, next) => {
    const { departmentId, year, semesterType, linkedSubjectType, courseCategory } = req.query;
    if (!departmentId || !year || !semesterType || !linkedSubjectType || !courseCategory) {
        return res.status(400).json({ message: "Department, Year, Semester Type, Linked Subject Type, and Course Category are required." });
    }
    const deptIdNum = parseInt(departmentId); const yearNum = parseInt(year); const semesterNum = calculateSemester(yearNum, semesterType);
    if (isNaN(deptIdNum) || isNaN(yearNum) || semesterNum === null) {
        return res.status(400).json({ message: "Invalid department, year, or semester type provided." });
    }
    try {
        const relevantTemporaryDivisions = await prisma.division.findMany({
            where: {
                departmentId: deptIdNum, year: yearNum, semester: semesterNum,
                divisionType: DivisionType.Temporary, linkedSubjectType: linkedSubjectType, courseCategory: courseCategory,       
            },
            include: {
                composedOfPermanentBatches: { 
                    select: { id: true, name: true, permanentDivision: { select: { id: true, name: true } } },
                    orderBy: { name: 'asc' }
                }
            }
        });
        if (relevantTemporaryDivisions.length === 0) return res.status(200).json([]);
        const batchMap = new Map();
        relevantTemporaryDivisions.forEach(tempDiv => {
            tempDiv.composedOfPermanentBatches.forEach(permBatch => {
                if (!batchMap.has(permBatch.id)) {
                    batchMap.set(permBatch.id, {
                        id: permBatch.id, name: permBatch.name,
                        permanentDivisionId: permBatch.permanentDivision.id,
                        permanentDivisionName: permBatch.permanentDivision.name 
                    });
                }
            });
        });
        const availableBatches = Array.from(batchMap.values()).sort((a, b) => {
            const divCompare = a.permanentDivisionName.localeCompare(b.permanentDivisionName);
            if (divCompare !== 0) return divCompare;
            return a.name.localeCompare(b.name);
        });
        res.status(200).json(availableBatches);
    } catch (error) { next(error); }
});

router.put('/custom-lab-group-sets/:setId', authorize(UserRole.Admin), async (req, res, next) => {
    const setId = parseInt(req.params.setId);
    if (isNaN(setId)) return res.status(400).json({ message: "Invalid Set ID." });
    const { customLabBatches } = req.body; 
    if (!Array.isArray(customLabBatches)) return res.status(400).json({ message: "customLabBatches must be an array." });
    for (const batchDef of customLabBatches) { 
        if (!batchDef.name || !batchDef.name.trim() || !Array.isArray(batchDef.permanentBatchIds) || batchDef.permanentBatchIds.length === 0 || batchDef.permanentBatchIds.some(id => isNaN(parseInt(id)))) {
            return res.status(400).json({ message: "Each custom lab batch must have a valid name and be composed of at least one valid permanent batch ID." });
        }
    }
    try {
        const updatedSet = await prisma.$transaction(async (tx) => {
            await tx.customLabBatch.deleteMany({ where: { customLabGroupSetId: setId } });
            if (customLabBatches.length > 0) {
                 for (const batchDef of customLabBatches) { 
                    await tx.customLabBatch.create({
                        data: {
                            name: batchDef.name.trim(), customLabGroupSetId: setId,
                            composedOfPermanentBatches: { connect: batchDef.permanentBatchIds.map(id => ({ id: parseInt(id) })) }
                        }
                    });
                }
            }
            return tx.customLabGroupSet.findUnique({
                where: { id: setId },
                include: { department: true, customLabBatches: { include: { composedOfPermanentBatches: {select: {id:true, name:true, permanentDivision: {select: {id:true, name:true}}}}} } }
            });
        });
        res.status(200).json({ message: "Custom Lab Group Set updated successfully.", customLabGroupSet: updatedSet });
    } catch (error) {
        if (error.code === 'P2002') return res.status(409).json({ message: "A custom lab batch name is not unique within this set." });
        if (error.code === 'P2025') return res.status(400).json({ message: 'Invalid reference: One or more selected permanent batch IDs for composition are invalid or the CustomLabGroupSet ID itself is invalid.' });
        next(error);
    }
});

router.delete('/custom-lab-group-sets/:setId', authorize(UserRole.Admin), async (req, res, next) => {
    const setId = parseInt(req.params.setId);
    if (isNaN(setId)) return res.status(400).json({ message: "Invalid Set ID." });
    try {
        const allocationsExist = await prisma.loadAllocation.findFirst({ where: { customLabBatch: { customLabGroupSetId: setId } } });
        if (allocationsExist) return res.status(409).json({ message: "Cannot delete set. One or more of its custom lab batches are referenced in Load Allocations. Please remove those allocations first." });
        await prisma.customLabGroupSet.delete({ where: { id: setId } }); 
        res.status(200).json({ message: "Custom Lab Group Set deleted successfully." });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ message: "Custom Lab Group Set not found." });
        if (error.code === 'P2003') return res.status(409).json({ message: "Cannot delete set due to existing references (potentially in Load Allocations)." });
        next(error);
    }
});


// --- MOVED BATCH ROUTES BEFORE GENERAL /:id ROUTE ---
// GET Batches for a specific Permanent Division
router.get('/:divisionId/batches', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const divisionId = parseInt(req.params.divisionId);
    if (isNaN(divisionId)) {
        return res.status(400).json({ message: 'Invalid Division ID.' });
    }
    try {
        const division = await prisma.division.findUnique({ where: { id: divisionId } });
        if (!division) {
            return res.status(404).json({ message: 'Division not found.' });
        }
        if (division.divisionType !== DivisionType.Permanent) {
            return res.status(400).json({ message: 'Batches can only be listed for Permanent type divisions directly via this route.' });
        }
        const batches = await prisma.batch.findMany({
            where: { permanentDivisionId: divisionId },
            orderBy: { name: 'asc' },
        });
        res.status(200).json(batches);
    } catch (error) {
        next(error);
    }
});

// POST Create New Batch for a Permanent Division
router.post('/:divisionId/batches', authorize(UserRole.Admin), async (req, res, next) => {
    const divisionId = parseInt(req.params.divisionId);
    const { name } = req.body;
    if (isNaN(divisionId)) return res.status(400).json({ message: 'Invalid Division ID.' });
    if (!name || !name.trim()) return res.status(400).json({ message: 'Batch name is required.' });
    try {
        const division = await prisma.division.findUnique({ where: { id: divisionId } });
        if (!division || division.divisionType !== DivisionType.Permanent) {
            return res.status(400).json({ message: 'Batches can only be added to Permanent divisions.' });
        }
        const newBatch = await prisma.batch.create({ data: { name: name.trim(), permanentDivisionId: divisionId } });
        res.status(201).json({ message: 'Batch created successfully.', batch: newBatch });
    } catch (error) {
        if (error.code === 'P2002') return res.status(409).json({ message: `Batch '${name}' already exists in this division.` });
        next(error);
    }
});

// PUT Update Batch Name
router.put('/batches/:batchId', authorize(UserRole.Admin), async (req, res, next) => {
    const batchId = parseInt(req.params.batchId);
    const { name } = req.body;
    if (isNaN(batchId)) return res.status(400).json({ message: 'Invalid Batch ID.' });
    if (!name || !name.trim()) return res.status(400).json({ message: 'Batch name is required.' });
    try {
        const batchToUpdate = await prisma.batch.findUnique({ where: { id: batchId } });
        if (!batchToUpdate) return res.status(404).json({ message: 'Batch not found.' });
         if (batchToUpdate.name.toLowerCase() !== name.trim().toLowerCase()) {
            const existingBatchWithNewName = await prisma.batch.findUnique({
                where: { name_permanentDivisionId: { name: name.trim(), permanentDivisionId: batchToUpdate.permanentDivisionId } }
            });
            if (existingBatchWithNewName) return res.status(409).json({ message: `Another batch with name '${name}' already exists in this division.` });
        }
        const updatedBatch = await prisma.batch.update({ where: { id: batchId }, data: { name: name.trim() } });
        res.status(200).json({ message: 'Batch updated successfully.', batch: updatedBatch });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ message: 'Batch not found.' });
        if (error.code === 'P2002') return res.status(409).json({ message: 'Batch name conflict.' });
        next(error);
    }
});

// DELETE Batch
router.delete('/batches/:batchId', authorize(UserRole.Admin), async (req, res, next) => {
    const batchId = parseInt(req.params.batchId);
    if (isNaN(batchId)) return res.status(400).json({ message: 'Invalid Batch ID.' });
    try {
        const loadAllocationsCount = await prisma.loadAllocation.count({ where: { batchId: batchId } });
        const studentChoicesCount = await prisma.studentElectiveChoice.count({ where: { batchId: batchId }});
        const timetableSlotsCount = await prisma.timetableSlot.count({ where: { batchId: batchId }});
        const tempDivCompositionCount = await prisma.division.count({ where: { composedOfPermanentBatches: { some: { id: batchId } } } });
        const customLabCompositionCount = await prisma.customLabBatch.count({ where: { composedOfPermanentBatches: { some: { id: batchId } } } });

        if (loadAllocationsCount > 0 || studentChoicesCount > 0 || timetableSlotsCount > 0 || tempDivCompositionCount > 0 || customLabCompositionCount > 0) {
            let messages = [];
            if (loadAllocationsCount > 0) messages.push("load allocations");
            if (studentChoicesCount > 0) messages.push("student elective choices");
            if (timetableSlotsCount > 0) messages.push("timetable slots");
            if (tempDivCompositionCount > 0) messages.push("temporary division compositions");
            if (customLabCompositionCount > 0) messages.push("custom lab group compositions");
            return res.status(409).json({ message: `Cannot delete batch. It is associated with existing ${messages.join(', ')}.` });
        }
        await prisma.batch.delete({ where: { id: batchId } });
        res.status(200).json({ message: 'Batch deleted successfully.' });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ message: 'Batch not found.' });
        if (error.code === 'P2003') return res.status(409).json({ message: `Cannot delete batch due to other existing references.` });
        next(error);
    }
});


// --- General Division Collection Routes ---
// GET All Divisions (filterable)
router.get('/', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { departmentId, year, semesterType, divisionType, name, courseCategory, linkedSubjectType } = req.query;
    const where = {};
    if (departmentId) { const id = parseInt(departmentId); if (!isNaN(id)) where.departmentId = id; }
    if (year && semesterType) {
        const yr = parseInt(year); const sem = calculateSemester(yr, semesterType);
        if (!isNaN(yr) && sem !== null) { where.year = yr; where.semester = sem; }
    } else if (year) { const yr = parseInt(year); if (!isNaN(yr)) where.year = yr;
    } else if (req.query.semester) { const sem = parseInt(req.query.semester); if(!isNaN(sem)) where.semester = sem;}
    if (divisionType && Object.values(DivisionType).includes(divisionType)) where.divisionType = divisionType;
    if (linkedSubjectType && Object.values(SubjectType).includes(linkedSubjectType)) where.linkedSubjectType = linkedSubjectType;
    if (name) where.name = { contains: name, mode: 'insensitive' };
    if (courseCategory) where.courseCategory = { contains: courseCategory, mode: 'insensitive' };
    try {
        const divisions = await prisma.division.findMany({
            where,
            include: {
                department: { select: { id: true, name: true } },
                batches: { orderBy: { name: 'asc' } },
                composedOfPermanentBatches: {
                    select: { id: true, name: true, permanentDivision: { select: { name: true, id: true } } },
                    orderBy: { name: 'asc' }
                }
            },
            orderBy: [{ department: { name: 'asc' } }, { year: 'asc' }, { semester: 'asc' }, { name: 'asc' }],
        });
        let customLabSetsMap = new Map();
        const hasTemporaryDivisions = divisions.some(d => d.divisionType === DivisionType.Temporary);
        if (hasTemporaryDivisions) {
            const customLabSetBaseQuery = {};
            if (where.departmentId) customLabSetBaseQuery.departmentId = where.departmentId;
            if (where.year) customLabSetBaseQuery.year = where.year;
            if (where.semester) customLabSetBaseQuery.semester = where.semester;
            const allPotentiallyRelevantCustomLabSets = await prisma.customLabGroupSet.findMany({
                where: customLabSetBaseQuery, 
                include: {
                    customLabBatches: {
                        include: { composedOfPermanentBatches: { select: { id: true, name: true, permanentDivision: { select: { id: true, name: true } } }, orderBy: { name: 'asc' } } },
                        orderBy: { name: 'asc' }
                    }
                }
            });
            allPotentiallyRelevantCustomLabSets.forEach(set => {
                const key = `${set.departmentId}-${set.year}-${set.semester}-${set.linkedSubjectType}-${set.courseCategory}`;
                customLabSetsMap.set(key, set);
            });
        }
        const divisionsWithCustomLabInfo = divisions.map(div => {
            if (div.divisionType === DivisionType.Temporary && div.linkedSubjectType && div.courseCategory) {
                const key = `${div.departmentId}-${div.year}-${div.semester}-${div.linkedSubjectType}-${div.courseCategory}`;
                return { ...div, applicableCustomLabGroupSet: customLabSetsMap.get(key) || null };
            }
            return { ...div, applicableCustomLabGroupSet: null };
        });
        res.status(200).json(divisionsWithCustomLabInfo);
    } catch (error) { next(error); }
});

// POST Create New Division
router.post('/', authorize(UserRole.Admin), async (req, res, next) => {
    const { name, departmentId, year, semesterType, divisionType, defaultBatchCount, courseCategory, linkedSubjectType, permanentBatchIds } = req.body;
    if (!name || !departmentId || !year || !semesterType || !divisionType) {
        return res.status(400).json({ message: "Name, Department, Year, Semester Type, and Division Type are required." });
    }
    const deptIdNum = parseInt(departmentId); const yearNum = parseInt(year); const semesterNum = calculateSemester(yearNum, semesterType);
    if (isNaN(deptIdNum) || isNaN(yearNum) || semesterNum === null) return res.status(400).json({ message: "Invalid Department, Year, or Semester Type." });
    if (!Object.values(DivisionType).includes(divisionType)) return res.status(400).json({ message: "Invalid Division Type." });
    if (divisionType === DivisionType.Permanent && (defaultBatchCount === undefined || parseInt(defaultBatchCount) < 0)) return res.status(400).json({ message: "Default Batch Count must be a non-negative number for Permanent divisions." });
    if (divisionType === DivisionType.Temporary && linkedSubjectType === SubjectType.Common) return res.status(400).json({ message: 'Temporary divisions cannot be linked to "Common" subject type.' });
    if (divisionType === DivisionType.Temporary && linkedSubjectType && linkedSubjectType !== SubjectType.Common && (!courseCategory || !courseCategory.trim())) return res.status(400).json({ message: `Course Category is required for Temporary ${linkedSubjectType} divisions.` });
    if (divisionType === DivisionType.Temporary && (!Array.isArray(permanentBatchIds) || permanentBatchIds.length === 0 || permanentBatchIds.some(id => isNaN(parseInt(id))))) return res.status(400).json({ message: "Temporary divisions must be composed of at least one valid permanent batch ID for theory lectures." });
    try {
        const existingDivision = await prisma.division.findUnique({ where: { name_year_semester_departmentId: { name: name.trim(), year: yearNum, semester: semesterNum, departmentId: deptIdNum } } });
        if (existingDivision) return res.status(409).json({ message: `Division '${name}' already exists for this department, year, and semester.` });
        const createData = {
            name: name.trim(), departmentId: deptIdNum, year: yearNum, semester: semesterNum, divisionType: divisionType,
            courseCategory: (courseCategory && courseCategory.trim() !== '') ? courseCategory.trim() : null,
            linkedSubjectType: (linkedSubjectType === "" || linkedSubjectType === null) ? null : linkedSubjectType,
        };
        if (divisionType === DivisionType.Permanent) {
            const batchesToCreate = []; const numBatches = parseInt(defaultBatchCount) || 0;
            for (let i = 1; i <= numBatches; i++) batchesToCreate.push({ name: `${name.trim()}${i}` });
            if (batchesToCreate.length > 0) createData.batches = { create: batchesToCreate };
        } else { createData.composedOfPermanentBatches = { connect: permanentBatchIds.map(id => ({ id: parseInt(id) })) }; }
        const newDivision = await prisma.division.create({
            data: createData,
            include: { department: true, batches: true, composedOfPermanentBatches: {select: {id:true, name:true, permanentDivision: {select: {name:true, id:true}}}}}
        });
        res.status(201).json({ message: 'Division created successfully.', division: newDivision });
    } catch (error) {
        if (error.code === 'P2002') return res.status(409).json({ message: `Division name '${name}' might already exist under the same context.` });
        if (error.code === 'P2025' && divisionType === DivisionType.Temporary) return res.status(400).json({ message: 'Invalid reference: One or more selected permanent batch IDs for composition are invalid.' });
        next(error);
    }
});

// --- General :id routes for Divisions (MUST BE LAST for GET, PUT, DELETE on /divisions/:id) ---
router.get('/:id', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { id } = req.params;
    const divisionId = parseInt(id);
    if (isNaN(divisionId)) return res.status(400).json({ message: 'Invalid Division ID format (from /:id route).' });
    try {
        const division = await prisma.division.findUnique({
            where: { id: divisionId },
            include: {
                department: true,
                batches: { orderBy: { name: 'asc' } },
                composedOfPermanentBatches: {
                    select: { id: true, name: true, permanentDivision: { select: { name: true, id: true } } },
                    orderBy: { name: 'asc' }
                }
            }
        });
        if (!division) return res.status(404).json({ message: `Division with ID ${divisionId} not found.` });
        let applicableCustomLabGroupSet = null;
        if (division.divisionType === DivisionType.Temporary && division.linkedSubjectType && division.courseCategory) {
            applicableCustomLabGroupSet = await prisma.customLabGroupSet.findUnique({
                where: {
                    unique_elective_offering_lab_group_set: {
                        departmentId: division.departmentId, year: division.year, semester: division.semester,
                        linkedSubjectType: division.linkedSubjectType, courseCategory: division.courseCategory,
                    }
                },
                include: { customLabBatches: { include: { composedOfPermanentBatches: {select: {id:true, name:true, permanentDivision: {select: {id:true, name:true}}}}} } }
            });
        }
        res.status(200).json({ ...division, applicableCustomLabGroupSet });
    } catch(e) { next(e); }
});

router.put('/:id', authorize(UserRole.Admin), async (req, res, next) => {
    const { id } = req.params;
    const divisionId = parseInt(id);
    if (isNaN(divisionId)) return res.status(400).json({ message: 'Invalid Division ID format.' });
    const { name, courseCategory, linkedSubjectType, permanentBatchIds } = req.body;
    const updateData = {};
    const currentDivision = await prisma.division.findUnique({ where: { id: divisionId } });
    if (!currentDivision) return res.status(404).json({ message: `Division with ID ${divisionId} not found.` });
    let immutableFieldChanged = false;
    if (req.body.departmentId !== undefined && parseInt(req.body.departmentId) !== currentDivision.departmentId) immutableFieldChanged = true;
    if (req.body.year !== undefined && parseInt(req.body.year) !== currentDivision.year) immutableFieldChanged = true;
    if (req.body.semesterType !== undefined) {
        const newSem = calculateSemester(currentDivision.year, req.body.semesterType);
        if (newSem === null || newSem !== currentDivision.semester) immutableFieldChanged = true;
    }
    if (req.body.divisionType !== undefined && req.body.divisionType !== currentDivision.divisionType) immutableFieldChanged = true;
    if (immutableFieldChanged) return res.status(400).json({ message: "Department, Year, Semester, or Division Type cannot be changed after creation." });
    if (name !== undefined) updateData.name = String(name).trim();
    if (courseCategory !== undefined) updateData.courseCategory = courseCategory ? String(courseCategory).trim() : null;
    if (linkedSubjectType !== undefined) {
        const newLinkedType = (linkedSubjectType === "" || linkedSubjectType === null) ? null : linkedSubjectType;
        if (newLinkedType !== null && !Object.values(SubjectType).includes(newLinkedType)) return res.status(400).json({ message: 'Invalid Linked Subject Type.' });
        if (currentDivision.divisionType === DivisionType.Temporary && newLinkedType === SubjectType.Common) return res.status(400).json({ message: 'Temporary divisions cannot be linked to "Common" subject type.' });
        updateData.linkedSubjectType = newLinkedType;
    }
    if (currentDivision.divisionType === DivisionType.Temporary && permanentBatchIds !== undefined) {
        if (!Array.isArray(permanentBatchIds) || permanentBatchIds.some(id => isNaN(parseInt(id)))) {
            return res.status(400).json({ message: 'permanentBatchIds (for theory composition) must be an array of valid numbers.' });
        }
        updateData.composedOfPermanentBatches = { set: permanentBatchIds.map(bid => ({ id: parseInt(bid) })) };
    }
    if (Object.keys(updateData).length === 0) {
        const divisionWithRelations = await prisma.division.findUnique({
            where: { id: divisionId },
            include: { department: true, batches: { orderBy: { name: 'asc' } }, composedOfPermanentBatches: { select: { id: true, name: true, permanentDivision: { select: { name: true, id: true } } }, orderBy: { name: 'asc' } } }
        });
        return res.status(200).json({ message: 'No changes detected.', division: divisionWithRelations });
    }
    try {
        const finalName = updateData.name !== undefined ? updateData.name : currentDivision.name;
        if (finalName !== currentDivision.name) { 
            const conflictingDivision = await prisma.division.findFirst({
                where: { name: finalName, year: currentDivision.year, semester: currentDivision.semester, departmentId: currentDivision.departmentId, id: { not: divisionId } }
            });
            if (conflictingDivision) return res.status(409).json({ message: 'Another division with this name, year, semester, and department already exists.' });
        }
        const updatedDivision = await prisma.division.update({
            where: { id: divisionId }, data: updateData,
            include: { department: true, batches: { orderBy: { name: 'asc' } }, composedOfPermanentBatches: { select: { id: true, name: true, permanentDivision: { select: { name: true, id: true } } }, orderBy: { name: 'asc' } } }
        });
        res.status(200).json({ message: 'Division updated successfully.', division: updatedDivision });
    } catch (error) {
        if (error.code === 'P2025') return res.status(400).json({ message: 'Update failed: One or more selected permanent batch IDs for composition are invalid.' });
        if (error.code === 'P2002') return res.status(409).json({ message: 'Update failed. A division with the resulting name/combination already exists.' });
        next(error);
    }
});

router.delete('/:id', authorize(UserRole.Admin), async (req, res, next) => {
    const { id } = req.params;
    const divisionId = parseInt(id);
    if (isNaN(divisionId)) return res.status(400).json({ message: 'Invalid Division ID format.' });
    try {
        const loadAllocationsCount = await prisma.loadAllocation.count({ where: { divisionId: divisionId } });
        const timetableSlotsCount = await prisma.timetableSlot.count({ where: { divisionId: divisionId } });
        if (loadAllocationsCount > 0 || timetableSlotsCount > 0) {
            let messages = [];
            if (loadAllocationsCount > 0) messages.push("load allocations");
            if (timetableSlotsCount > 0) messages.push("timetable slots");
            return res.status(409).json({ message: `Cannot delete division. It is associated with existing ${messages.join(' and ')}.` });
        }
        await prisma.division.delete({ where: { id: divisionId } });
        res.status(200).json({ message: `Division with ID ${divisionId} deleted successfully.` });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ message: `Division with ID ${divisionId} not found.` });
        if (error.code === 'P2003') return res.status(409).json({ message: `Cannot delete division due to other existing references.` });
        next(error);
    }
});

export default router;
