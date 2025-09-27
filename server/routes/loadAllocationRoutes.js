// File: server/routes/loadAllocationRoutes.js
import express from 'express';
import { PrismaClient, UserRole, SubjectType, DivisionType, SyllabusType, FacultyDesignation } from '@prisma/client';
import { protect, authorize } from '../middleware/authMiddleware.js';
import multer from 'multer';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

const prisma = new PrismaClient();
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

const calculateSemesterNumber = (year, semesterType) => {
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) throw new Error('Invalid year level.');
    const semTypeLower = String(semesterType).toLowerCase();
    if (semTypeLower === 'odd') return yearNum * 2 - 1;
    if (semTypeLower === 'even') return yearNum * 2;
    throw new Error("Invalid semester type.");
};

// --- GET Data for Load Allocation UI ---
router.get('/data-for-ui', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { departmentId, year, semesterType, subjectType, courseCategory } = req.query;

    if (!departmentId || !year || !semesterType) {
        return res.status(400).json({ message: 'Department, Year Level, and Semester Type are required.' });
    }

    let calculatedSemester;
    try {
        calculatedSemester = calculateSemesterNumber(year, semesterType);
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }
    const deptIdNum = parseInt(departmentId);
    const yearNum = parseInt(year);

    try {
        const subjectWhereClause = {
            departmentId: deptIdNum,
            year: yearNum,
            semester: calculatedSemester,
        };
        if (subjectType && Object.values(SubjectType).includes(subjectType)) {
            subjectWhereClause.subjectType = subjectType;
        }
        if (courseCategory) {
            subjectWhereClause.courseCategory = { contains: courseCategory, mode: 'insensitive' };
        }
        const subjects = await prisma.subject.findMany({
            where: subjectWhereClause,
            select: {
                id: true, code: true, name: true, subjectType: true, courseGroup: true, courseCategory: true,
                theoryHours: true, practicalHours: true, departmentId: true, year: true, semester: true
            },
            orderBy: [{ subjectType: 'asc' }, { courseGroup: 'asc' }, { courseCategory: 'asc' }, { name: 'asc' }],
        });

        const faculty = await prisma.faculty.findMany({
            select: {
                id: true, name: true, uniqueId: true, designation: true,
                department: { select: { id: true, name: true } }
            },
            orderBy: [{ department: { name: 'asc' } }, { name: 'asc' }],
        });

        const divisions = await prisma.division.findMany({
            where: {
                departmentId: deptIdNum,
                year: yearNum,
                semester: calculatedSemester,
            },
            include: {
                department: { select: { name: true, id: true } },
                batches: {
                    select: { id: true, name: true, permanentDivisionId: true },
                    orderBy: { name: 'asc' }
                },
                composedOfPermanentBatches: {
                    select: { id: true, name: true, permanentDivision: { select: { name: true, id: true } } },
                    orderBy: { name: 'asc' }
                }
            },
            orderBy: [{ divisionType: 'asc' }, { name: 'asc' }],
        });

        const customLabGroupSets = await prisma.customLabGroupSet.findMany({
            where: {
                departmentId: deptIdNum,
                year: yearNum,
                semester: calculatedSemester,
                ...(subjectType && ['DLO', 'ILOT', 'MajorMinor'].includes(subjectType) && { linkedSubjectType: subjectType }),
                ...(courseCategory && { courseCategory: courseCategory })
            },
            include: {
                customLabBatches: {
                    include: {
                        composedOfPermanentBatches: {
                            select: { id: true, name: true, permanentDivision: { select: { name: true, id: true } } }
                        }
                    },
                    orderBy: { name: 'asc' }
                }
            }
        });

        const currentAcademicSessionYear = new Date().getFullYear();
        const studentElectiveChoices = await prisma.studentElectiveChoice.findMany({
            where: {
                departmentId: deptIdNum,
                semester: calculatedSemester,
                academicYear: currentAcademicSessionYear,
            },
            select: { subjectId: true, batchId: true, studentCount: true, batch: { select: { id: true, name: true, permanentDivisionId: true } } }
        });

        res.status(200).json({ subjects, faculty, divisions, studentElectiveChoices, customLabGroupSets });

    } catch (error) {
        console.error("Get Data for Load Allocation UI Error:", error);
        next(error);
    }
});

// --- POST Create/Update Load Allocations (Bulk) ---
router.post('/', authorize(UserRole.Admin), async (req, res, next) => {
    const allocations = req.body.allocations;

    if (!Array.isArray(allocations)) {
        return res.status(400).json({ message: 'Invalid format. Expected an array of allocations.' });
    }

    const results = { created: 0, updated: 0, deleted: 0, errors: [] };

    for (let i = 0; i < allocations.length; i++) {
        const alloc = allocations[i];
        const { facultyId, subjectId, divisionId, batchId, customLabBatchGroupId, allocationType } = alloc;

        if (subjectId === undefined || divisionId === undefined || allocationType === undefined) {
            results.errors.push({ index: i, message: 'Missing subjectId, divisionId, or allocationType.' }); continue;
        }
        if (!Object.values(SyllabusType).includes(allocationType)) {
            results.errors.push({ index: i, subjectId, divisionId, message: 'Invalid allocationType.' }); continue;
        }
        if (batchId && customLabBatchGroupId) { // This refers to the ID from the payload
            results.errors.push({ index: i, message: 'Cannot have both batchId and customLabBatchGroupId for an allocation.' }); continue;
        }

        const subId = parseInt(subjectId);
        const divId = parseInt(divisionId);
        const facId = facultyId ? parseInt(facultyId) : null;
        const bId = batchId ? parseInt(batchId) : null;
        const clbgId = customLabBatchGroupId ? parseInt(customLabBatchGroupId) : null; // This is the ID from payload

        if (isNaN(subId) || isNaN(divId) || (facultyId && isNaN(facId)) || (batchId && isNaN(bId)) || (customLabBatchGroupId && isNaN(clbgId))) {
            results.errors.push({ index: i, message: 'Invalid ID format.' }); continue;
        }

        try {
            // CORRECTED: Use customLabBatchId for Prisma query
            const findWhere = {
                subjectId: subId,
                divisionId: divId,
                allocationType: allocationType,
                batchId: bId,
                customLabBatchId: clbgId, // Prisma field name
            };

            const existingAllocation = await prisma.loadAllocation.findFirst({ where: findWhere });

            if (facId === null || facId === 0) { 
                if (existingAllocation) {
                    await prisma.loadAllocation.delete({ where: { id: existingAllocation.id } });
                    results.deleted++;
                }
            } else { 
                // CORRECTED: Use customLabBatchId for Prisma create/update data
                const dataToUpsert = {
                    subjectId: subId,
                    divisionId: divId,
                    allocationType: allocationType,
                    batchId: bId,
                    customLabBatchId: clbgId, // Prisma field name
                    facultyId: facId
                };

                if (existingAllocation) {
                    if (existingAllocation.facultyId !== facId) {
                        await prisma.loadAllocation.update({
                            where: { id: existingAllocation.id },
                            data: { facultyId: facId }
                        });
                        results.updated++;
                    }
                } else {
                    await prisma.loadAllocation.create({ data: dataToUpsert });
                    results.created++;
                }
            }
        } catch (error) {
            console.error(`Error processing allocation at index ${i}:`, error);
            let errorMsg = error.message || 'Database error.';
            if (error.code === 'P2003') errorMsg = `Invalid reference ID provided. Details: ${error.meta?.field_name || 'unknown field'}`;
            else if (error.code === 'P2002') errorMsg = `This allocation conflicts with an existing one. Details: ${error.meta?.target?.join(', ')}`;
            results.errors.push({ index: i, subjectId: subId, divisionId: divId, batchId: bId, customLabBatchGroupId: clbgId, message: errorMsg });
        }
    }

    const summaryMessage = `Load allocation: Created: ${results.created}, Updated: ${results.updated}, Unassigned/Deleted: ${results.deleted}. Errors: ${results.errors.length}.`;
    if (results.errors.length > 0) {
        const statusCode = (results.created > 0 || results.updated > 0 || results.deleted > 0) ? 207 : 400;
        return res.status(statusCode).json({ message: summaryMessage, ...results });
    }
    res.status(201).json({ message: summaryMessage, ...results });
});

// --- GET Existing Load Allocations (filterable) ---
router.get('/', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { departmentId, year, semesterType, subjectId, facultyId, divisionId, batchId, customLabBatchGroupId, allocationType, subjectType, courseCategory } = req.query;
    const where = {};
    const subjectWhere = {};
    const divisionWhere = {}; 

    if (departmentId) {
        const deptIdNum = parseInt(departmentId);
        subjectWhere.departmentId = deptIdNum;
        divisionWhere.departmentId = deptIdNum;
    }
    if (year && semesterType) {
        try {
            const calculatedSemester = calculateSemesterNumber(year, semesterType);
            subjectWhere.year = parseInt(year);
            subjectWhere.semester = calculatedSemester;
            divisionWhere.year = parseInt(year);
            divisionWhere.semester = calculatedSemester;
        } catch (e) { return res.status(400).json({ message: e.message }); }
    }
    if (subjectType && Object.values(SubjectType).includes(subjectType)) {
        subjectWhere.subjectType = subjectType;
    }
    if (courseCategory) {
        subjectWhere.courseCategory = { contains: courseCategory, mode: 'insensitive' };
    }

    if (Object.keys(subjectWhere).length > 0) where.subject = subjectWhere;
    if (Object.keys(divisionWhere).length > 0) where.division = divisionWhere; 
    
    if (subjectId) where.subjectId = parseInt(subjectId);
    if (facultyId) where.facultyId = parseInt(facultyId);
    if (divisionId) where.divisionId = parseInt(divisionId); 
    if (batchId) where.batchId = parseInt(batchId);
    // CORRECTED: Query by customLabBatchId if customLabBatchGroupId is provided
    if (customLabBatchGroupId) where.customLabBatchId = parseInt(customLabBatchGroupId);
    if (allocationType && Object.values(SyllabusType).includes(allocationType)) {
        where.allocationType = allocationType;
    }

    try {
        const allocations = await prisma.loadAllocation.findMany({
            where,
            include: {
                faculty: { select: { id: true, name: true, uniqueId: true, designation: true, department: { select: { name: true } } } },
                subject: { select: { id: true, code: true, name: true, subjectType: true, courseCategory: true, department: {select: {name: true}} } },
                division: { select: { id: true, name: true, divisionType: true, courseCategory: true, linkedSubjectType: true, department: {select: {name: true}} } },
                batch: { select: { id: true, name: true, permanentDivisionId: true } },
                customLabBatch: { 
                    select: { id: true, name: true }
                },
            },
            orderBy: [
                { subject: { name: 'asc' } }, 
                { division: { name: 'asc' } }, 
                { batch: { name: 'asc' } }, 
                { customLabBatch: { name: 'asc' } }, 
                { allocationType: 'asc' },
            ],
        });
        res.status(200).json(allocations);
    } catch (error) {
        console.error("Get Load Allocations Error:", error);
        next(error);
    }
});

// --- POST Upload Load Allocations from Excel ---
router.post('/upload-excel', authorize(UserRole.Admin), upload.single('file'), async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }
    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    let rawData = [];
    const results = { created: 0, updated: 0, deleted: 0, errors: [], warnings: [] };
    let rowNum = 1;

    try {
        const transformHeader = header => String(header).toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '');
        if (fileName.endsWith('.csv')) { 
            const csvString = fileBuffer.toString('utf8');
            const parsed = Papa.parse(csvString, { header: true, skipEmptyLines: true, transformHeader });
            if (parsed.errors.length) { return res.status(400).json({ message: 'Error parsing CSV.', errors: parsed.errors.map(e => `Row ${e.row}: ${e.message}`) });}
            rawData = parsed.data;
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) { 
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonDataAsArray = XLSX.utils.sheet_to_json(worksheet, { defval: "", header: 1 });
            if (jsonDataAsArray.length === 0) return res.status(400).json({ message: 'Excel sheet is empty.' });
            const headers = jsonDataAsArray[0].map(transformHeader);
            rawData = jsonDataAsArray.slice(1).map(arr => headers.reduce((obj, header, i) => ({ ...obj, [header]: arr[i] !== null && arr[i] !== undefined ? String(arr[i]).trim() : "" }), {}));
        } else { return res.status(400).json({ message: 'Unsupported file type. Use CSV or Excel.' }); }
        if (!rawData || rawData.length === 0) { return res.status(400).json({ message: 'File is empty or has no data rows.' });}
        
        const allDepartments = await prisma.department.findMany({select: {id: true, name: true}});
        const allSubjects = await prisma.subject.findMany({ select: { id: true, code: true, name: true, departmentId: true, year: true, semester: true, subjectType: true, courseCategory: true } });
        const allFaculty = await prisma.faculty.findMany({ select: { id: true, uniqueId: true, name: true } });
        const allDivisions = await prisma.division.findMany({ 
            select: { 
                id: true, name: true, departmentId: true, year: true, semester: true, 
                divisionType: true, linkedSubjectType: true, courseCategory: true,
                composedOfPermanentBatches: {select: {id:true, name:true}} // For temp division batch resolution
            }
        });
        const allPermanentBatches = await prisma.batch.findMany({ select: {id: true, name: true, permanentDivisionId: true}});
        const allCustomLabGroupSets = await prisma.customLabGroupSet.findMany({
            include: {
                customLabBatches: {select: {id:true, name:true}}
            }
        });

        for (const row of rawData) {
            rowNum++;
            const {
                facultyiduniqueid, subjectcode, divisionname, batchname, allocationtype,
                departmentname, year, semestertype
            } = row;

            if (!facultyiduniqueid || !subjectcode || !divisionname || !allocationtype || !departmentname || !year || !semestertype) {
                results.errors.push({ row: rowNum, message: "Missing required fields." }); continue;
            }

            const faculty = allFaculty.find(f => f.uniqueId === facultyiduniqueid || f.name.toLowerCase() === facultyiduniqueid.toLowerCase());
            if (!faculty && facultyiduniqueid.toLowerCase() !== 'unassign' && facultyiduniqueid.toLowerCase() !== 'unassigned' && facultyiduniqueid !== '') {
                results.errors.push({ row: rowNum, message: `Faculty '${facultyiduniqueid}' not found.` }); continue;
            }

            const targetDepartment = allDepartments.find(d => d.name.toLowerCase() === departmentname.toLowerCase());
            if (!targetDepartment) { results.errors.push({ row: rowNum, message: `Department '${departmentname}' not found.` }); continue; }

            const targetSemester = calculateSemesterNumber(year, semestertype);
            if (!targetSemester) { results.errors.push({ row: rowNum, message: `Invalid year/semester type: ${year}/${semestertype}.` }); continue; }

            const subject = allSubjects.find(s =>
                (s.code.toLowerCase() === subjectcode.toLowerCase() || s.name.toLowerCase() === subjectcode.toLowerCase()) &&
                s.departmentId === targetDepartment.id && s.year === parseInt(year) && s.semester === targetSemester
            );
            if (!subject) { results.errors.push({ row: rowNum, message: `Subject '${subjectcode}' not found for context.` }); continue; }

            const division = allDivisions.find(d =>
                d.name.toLowerCase() === divisionname.toLowerCase() &&
                d.departmentId === targetDepartment.id && d.year === parseInt(year) && d.semester === targetSemester
            );
            if (!division) { results.errors.push({ row: rowNum, message: `Division '${divisionname}' not found for context.` }); continue; }

            if (!Object.values(SyllabusType).includes(allocationtype)) {
                results.errors.push({ row: rowNum, message: `Invalid Allocation Type: '${allocationtype}'.` }); continue;
            }

            let batchIdToSave = null;
            let customLabBatchIdToSave = null; // Changed from customLabBatchGroupIdToSave

            if (allocationtype === SyllabusType.Lab) {
                if (!batchname) { results.errors.push({ row: rowNum, message: "Batch/Custom Group Name required for Lab." }); continue; }

                const applicableCustomSet = allCustomLabGroupSets.find(cgs =>
                    cgs.departmentId === subject.departmentId &&
                    cgs.year === subject.year && cgs.semester === subject.semester &&
                    cgs.linkedSubjectType === subject.subjectType &&
                    cgs.courseCategory === subject.courseCategory
                );

                if (applicableCustomSet) {
                    const customLabBatch = applicableCustomSet.customLabBatches.find(clb => clb.name.toLowerCase() === batchname.toLowerCase());
                    if (!customLabBatch) { results.errors.push({ row: rowNum, message: `Custom Lab Group '${batchname}' not found in set for ${subject.courseCategory}.` }); continue; }
                    customLabBatchIdToSave = customLabBatch.id; // Use customLabBatchId
                } else { 
                    const permBatch = allPermanentBatches.find(pb => pb.name.toLowerCase() === batchname.toLowerCase() && pb.permanentDivisionId === division.id);
                    if (!permBatch && division.divisionType === 'Permanent') { 
                        results.errors.push({ row: rowNum, message: `Permanent Batch '${batchname}' not found in Division '${division.name}'.` }); continue;
                    } else if (permBatch) {
                        batchIdToSave = permBatch.id;
                    } else if (division.divisionType === 'Temporary') {
                        const composedPermBatch = division.composedOfPermanentBatches?.find(compB => compB.name.toLowerCase() === batchname.toLowerCase());
                        if (composedPermBatch) {
                            batchIdToSave = composedPermBatch.id;
                        } else {
                             results.errors.push({ row: rowNum, message: `Could not resolve Batch '${batchname}' for Lab in Temporary Division '${division.name}' (no applicable custom set and not found in direct composition).` }); continue;
                        }
                    }
                }
            }
            
            const findWhere = {
                subjectId: subject.id, divisionId: division.id, allocationType: allocationtype,
                batchId: batchIdToSave, customLabBatchId: customLabBatchIdToSave, // Use customLabBatchId
            };
             if (batchIdToSave === null) findWhere.batchId = null;
             if (customLabBatchIdToSave === null) findWhere.customLabBatchId = null; // Use customLabBatchId

            const existingAllocation = await prisma.loadAllocation.findFirst({ where: findWhere });

            if (!faculty) { 
                if (existingAllocation) {
                    await prisma.loadAllocation.delete({ where: { id: existingAllocation.id } });
                    results.deleted++;
                }
            } else {
                const dataToUpsert = { ...findWhere, facultyId: faculty.id };
                if (existingAllocation) {
                    if (existingAllocation.facultyId !== faculty.id) {
                        await prisma.loadAllocation.update({ where: { id: existingAllocation.id }, data: { facultyId: faculty.id } });
                        results.updated++;
                    }
                } else {
                    await prisma.loadAllocation.create({ data: dataToUpsert });
                    results.created++;
                }
            }
        }

        const summaryMessage = `Excel import: Created: ${results.created}, Updated: ${results.updated}, Unassigned/Deleted: ${results.deleted}. Errors: ${results.errors.length}. Warnings: ${results.warnings.length}.`;
        if (results.errors.length > 0) {
            return res.status(207).json({ message: summaryMessage, ...results });
        }
        res.status(201).json({ message: summaryMessage, ...results });

    } catch (error) {
        console.error("Load Allocation Excel Upload Error:", error);
        results.errors.push({ row: 'General', message: error.message || "Error processing file." });
        res.status(500).json({ message: "Error processing Excel file.", ...results });
    }
});

export default router;
