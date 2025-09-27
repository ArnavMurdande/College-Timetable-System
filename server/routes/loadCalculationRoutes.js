// File: server/routes/loadCalculationRoutes.js
import express from 'express';
import { PrismaClient, UserRole, SyllabusType, FacultyDesignation, SubjectType, DivisionType } from '@prisma/client';
import { protect, authorize } from '../middleware/authMiddleware.js';

const prisma = new PrismaClient();
const router = express.Router();

router.use(protect);

const calculateSemesterNumber = (year, semesterType) => {
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) {
        throw new Error('Invalid year level. Must be 1-4.');
    }
    const semTypeLower = String(semesterType).toLowerCase();
    if (semTypeLower === 'odd') return yearNum * 2 - 1;
    if (semTypeLower === 'even') return yearNum * 2;
    throw new Error("Invalid semester type. Must be 'odd' or 'even'.");
};

// --- GET Faculty Load Calculation ---
router.get('/faculty', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { departmentId, year, semesterType, designation } = req.query;

    if (!departmentId || !year || !semesterType) {
        return res.status(400).json({ message: 'Department, Year Level, and Semester Type are required.' });
    }

    const deptIdNum = parseInt(departmentId);
    const yearNum = parseInt(year);
    let calculatedSemester;

    try {
        calculatedSemester = calculateSemesterNumber(yearNum, semesterType);
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }

    if (isNaN(deptIdNum)) {
        return res.status(400).json({ message: "Invalid Department ID format." });
    }

    try {
        const facultyWhereClause = { departmentId: deptIdNum };
        if (designation && Object.values(FacultyDesignation).includes(designation)) {
            facultyWhereClause.designation = designation;
        }

        const facultyInSelectedDepartment = await prisma.faculty.findMany({
            where: facultyWhereClause,
            select: {
                id: true, name: true, uniqueId: true, designation: true,
                department: { select: { id: true, name: true } }
            },
            orderBy: [{ designation: 'asc' }, { name: 'asc' }],
        });

        const facultyLoadResults = [];

        for (const faculty of facultyInSelectedDepartment) {
            const allocations = await prisma.loadAllocation.findMany({
                where: {
                    facultyId: faculty.id,
                    subject: {
                        year: yearNum,
                        semester: calculatedSemester,
                    },
                },
                include: {
                    subject: {
                        select: {
                            id: true, code: true, name: true,
                            theoryHours: true, practicalHours: true,
                            departmentId: true,
                            department: { select: { name: true } }
                        }
                    },
                    division: { select: { id: true, name: true } },
                    batch: { select: { id: true, name: true } },
                    customLabBatch: { select: { id: true, name: true } }
                },
            });

            const subjectLoadDetails = {};
            let facultyTotalTheoryHours = 0;
            let facultyTotalPracticalEngagementHours = 0;

            allocations.forEach(alloc => {
                const subId = alloc.subject.id;
                if (!subjectLoadDetails[subId]) {
                    subjectLoadDetails[subId] = {
                        subjectId: subId,
                        subjectName: alloc.subject.name,
                        subjectCode: alloc.subject.code,
                        subjectDepartmentName: alloc.subject.department.name,
                        baseTheoryHours: 0,
                        basePracticalHours: 0,
                        theoryAllocationsCount: 0,
                        labUnitsCount: 0,
                    };
                }

                if (alloc.allocationType === SyllabusType.Theory) {
                    subjectLoadDetails[subId].baseTheoryHours = alloc.subject.theoryHours;
                    facultyTotalTheoryHours += alloc.subject.theoryHours;
                    subjectLoadDetails[subId].theoryAllocationsCount += 1;
                } else if (alloc.allocationType === SyllabusType.Lab) {
                    subjectLoadDetails[subId].basePracticalHours = alloc.subject.practicalHours;
                    if (alloc.batchId || alloc.customLabBatchId) {
                        subjectLoadDetails[subId].labUnitsCount += 1;
                        facultyTotalPracticalEngagementHours += alloc.subject.practicalHours;
                    }
                }
            });

            const subjectsArray = Object.values(subjectLoadDetails).map(sub => ({
                ...sub,
            })).sort((a, b) => a.subjectName.localeCompare(b.subjectName));


            facultyLoadResults.push({
                facultyId: faculty.id,
                facultyName: faculty.name,
                facultyUniqueId: faculty.uniqueId,
                facultyDesignation: faculty.designation,
                departmentName: faculty.department.name,
                subjects: subjectsArray,
                totalTheoryHoursFaculty: facultyTotalTheoryHours,
                totalPracticalHoursFaculty: facultyTotalPracticalEngagementHours,
                grandTotalLoad: facultyTotalTheoryHours + facultyTotalPracticalEngagementHours,
            });
        }

        res.status(200).json(facultyLoadResults);

    } catch (error) {
        console.error("Get Faculty Load Calculation Error:", error);
        next(error);
    }
});


// --- GET Subject Load Calculation ---
router.get('/subject', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { departmentId, year, semesterType, subjectType, courseCategory } = req.query;

    if (!departmentId || !year || !semesterType) {
        return res.status(400).json({ message: 'Department, Year Level, and Semester Type are required.' });
    }

    const deptIdNum = parseInt(departmentId);
    const yearNum = parseInt(year);
    let calculatedSemester;

    try {
        calculatedSemester = calculateSemesterNumber(yearNum, semesterType);
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }
    if (isNaN(deptIdNum)) {
        return res.status(400).json({ message: "Invalid Department ID format." });
    }

    try {
        const subjectWhereClause = {
            departmentId: deptIdNum,
            year: yearNum,
            semester: calculatedSemester,
        };
        if (subjectType && Object.values(SubjectType).includes(subjectType)) {
            subjectWhereClause.subjectType = subjectType;
        }
        if (courseCategory && courseCategory.trim() !== '') {
            subjectWhereClause.courseCategory = { contains: courseCategory.trim(), mode: 'insensitive' };
        }

        const subjectsInScope = await prisma.subject.findMany({
            where: subjectWhereClause,
            select: {
                id: true, code: true, name: true, year: true, semester: true,
                theoryHours: true, practicalHours: true,
                subjectType: true, courseCategory: true, departmentId: true,
                avgStudentsPerDivision: true, avgStudentsPerBatch: true,
                department: { select: { name: true } }
            },
            orderBy: [{ year: 'asc' }, { semester: 'asc' }, { subjectType: 'asc' }, { courseCategory: 'asc' }, { name: 'asc' }],
        });

        const subjectLoadResults = [];

        for (const subject of subjectsInScope) {
            const allocations = await prisma.loadAllocation.findMany({
                where: { subjectId: subject.id },
                select: {
                    allocationType: true,
                    divisionId: true,
                    batchId: true,
                    customLabBatchId: true,
                },
            });

            const distinctDivisionsTheory = new Set();
            let distinctLabUnitsCount = 0;

            const customLabSet = await prisma.customLabGroupSet.findUnique({
                where: {
                    unique_elective_offering_lab_group_set: {
                        departmentId: subject.departmentId,
                        year: subject.year,
                        semester: subject.semester,
                        linkedSubjectType: subject.subjectType,
                        courseCategory: subject.courseCategory || "",
                    }
                },
                include: {
                    customLabBatches: { select: { id: true } }
                }
            });

            if (customLabSet && customLabSet.customLabBatches.length > 0) {
                const allocatedCustomLabBatchIds = new Set();
                allocations.forEach(alloc => {
                    if (alloc.allocationType === SyllabusType.Lab && alloc.customLabBatchId) {
                        allocatedCustomLabBatchIds.add(alloc.customLabBatchId);
                    }
                });
                distinctLabUnitsCount = allocatedCustomLabBatchIds.size;
            } else {
                const distinctBatchesLab = new Set();
                allocations.forEach(alloc => {
                    if (alloc.allocationType === SyllabusType.Lab && alloc.batchId) {
                        distinctBatchesLab.add(alloc.batchId);
                    }
                });
                distinctLabUnitsCount = distinctBatchesLab.size;
            }

            allocations.forEach(alloc => {
                if (alloc.allocationType === SyllabusType.Theory && alloc.divisionId) {
                    distinctDivisionsTheory.add(alloc.divisionId);
                }
            });

            const distinctDivisionsTheoryCount = distinctDivisionsTheory.size;
            const totalTheoryEngagementHours = subject.theoryHours * distinctDivisionsTheoryCount;
            const totalPracticalEngagementHours = subject.practicalHours * distinctLabUnitsCount;
            const overallTotalLoad = totalTheoryEngagementHours + totalPracticalEngagementHours;

            subjectLoadResults.push({
                subjectId: subject.id,
                subjectCode: subject.code,
                subjectName: subject.name,
                year: subject.year,
                departmentName: subject.department.name,
                subjectType: subject.subjectType,
                courseCategory: subject.courseCategory,
                baseTheoryHours: subject.theoryHours,
                totalTheoryEngagementHours,
                basePracticalHours: subject.practicalHours,
                totalPracticalUnits: distinctLabUnitsCount,
                totalPracticalEngagementHours,
                overallTotalLoad,
                distinctDivisionsTheoryCount,
                avgStudentsPerDivision: subject.avgStudentsPerDivision,
                avgStudentsPerBatch: subject.avgStudentsPerBatch,
            });
        }
        res.status(200).json(subjectLoadResults);
    } catch (error) {
        console.error("Get Subject Load Calculation Error:", error);
        next(error);
    }
});

// --- GET Department-wise Load Calculation ---
router.get('/department', authorize(UserRole.Admin, UserRole.Faculty), async (req, res, next) => {
    const { departmentId, year, semesterType } = req.query;

    if (!departmentId || !year || !semesterType) {
        return res.status(400).json({ message: 'Department, Year Level, and Semester Type are required.' });
    }

    const deptIdNum = parseInt(departmentId);
    const yearNum = parseInt(year);
    let calculatedSemester;

    try {
        calculatedSemester = calculateSemesterNumber(yearNum, semesterType);
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }

    if (isNaN(deptIdNum)) {
        return res.status(400).json({ message: "Invalid Department ID format." });
    }

    try {
        const department = await prisma.department.findUnique({
            where: { id: deptIdNum },
            select: { name: true }
        });
        if (!department) {
            return res.status(404).json({ message: `Department with ID ${deptIdNum} not found.` });
        }

        const subjectsInDepartment = await prisma.subject.findMany({
            where: {
                departmentId: deptIdNum,
                year: yearNum,
                semester: calculatedSemester,
            },
            include: {
                department: true,
            },
        });

        let totalDepartmentTheoryLoadAllocated = 0;
        let totalDepartmentPracticalLoadAllocated = 0;
        let totalExpectedTheoryLoad = 0;
        let totalExpectedPracticalLoad = 0;
        const unallocatedComponents = [];
        const externalFacultyMap = new Map(); // Key: facultyId, Value: { faculty details, allocationsInThisDept: [] }


        const allDivisionsInContext = await prisma.division.findMany({
            where: { departmentId: deptIdNum, year: yearNum, semester: calculatedSemester },
            include: { batches: true, composedOfPermanentBatches: { include: { permanentDivision: true } } }
        });

        const allCustomLabGroupSetsInContext = await prisma.customLabGroupSet.findMany({
            where: { departmentId: deptIdNum, year: yearNum, semester: calculatedSemester },
            include: { customLabBatches: { include: { composedOfPermanentBatches: { include: { permanentDivision: true } } } } }
        });
        
        const studentElectiveChoicesInContext = await prisma.studentElectiveChoice.findMany({
             where: { departmentId: deptIdNum, semester: calculatedSemester },
        });


        for (const subject of subjectsInDepartment) {
            const allocations = await prisma.loadAllocation.findMany({
                where: { subjectId: subject.id },
                include: { 
                    faculty: {
                        include: {
                            department: true // Faculty's own department
                        }
                    },
                    subject: { select: { id: true, code: true, name: true, theoryHours: true, practicalHours: true, departmentId: true } },
                    division: { select: { id: true, name: true } }, // Include division ID
                    batch: { select: { id: true, name: true } }, // Include batch ID
                    customLabBatch: { select: { id: true, name: true } } // Include custom lab batch ID
                },
            });

            const allocatedTheoryDivisions = new Set();
            let allocatedLabUnitsCount = 0;

            allocations.forEach(alloc => {
                if (alloc.allocationType === SyllabusType.Theory && alloc.divisionId) {
                    allocatedTheoryDivisions.add(alloc.divisionId);
                }
                // Process external faculty
                if (alloc.faculty && alloc.faculty.departmentId !== deptIdNum) { // External faculty
                    if (!externalFacultyMap.has(alloc.faculty.id)) {
                        externalFacultyMap.set(alloc.faculty.id, {
                            facultyId: alloc.faculty.id,
                            facultyName: alloc.faculty.name,
                            facultyUniqueId: alloc.faculty.uniqueId,
                            facultyDepartmentName: alloc.faculty.department?.name || 'Unknown Department',
                            allocationsInThisDept: []
                        });
                    }
                    externalFacultyMap.get(alloc.faculty.id).allocationsInThisDept.push({
                        subjectId: alloc.subject.id,
                        subjectCode: alloc.subject.code,
                        subjectName: alloc.subject.name,
                        allocationType: alloc.allocationType,
                        divisionName: alloc.division?.name || 'N/A',
                        batchName: alloc.customLabBatch?.name ? `${alloc.customLabBatch.name} (Custom)` : (alloc.batch?.name || null)
                    });
                }
            });
            totalDepartmentTheoryLoadAllocated += subject.theoryHours * allocatedTheoryDivisions.size;

            const customLabSet = allCustomLabGroupSetsInContext.find(cgs =>
                cgs.departmentId === subject.departmentId &&
                cgs.year === subject.year &&
                cgs.semester === subject.semester &&
                cgs.linkedSubjectType === subject.subjectType &&
                cgs.courseCategory === (subject.courseCategory || "")
            );

            if (customLabSet && customLabSet.customLabBatches.length > 0) {
                const allocatedCustomLabBatchIds = new Set(allocations.filter(a => a.allocationType === SyllabusType.Lab && a.customLabBatchId).map(a => a.customLabBatchId));
                allocatedLabUnitsCount = allocatedCustomLabBatchIds.size;
            } else {
                const allocatedPermanentBatchIds = new Set(allocations.filter(a => a.allocationType === SyllabusType.Lab && a.batchId).map(a => a.batchId));
                allocatedLabUnitsCount = allocatedPermanentBatchIds.size;
            }
            totalDepartmentPracticalLoadAllocated += subject.practicalHours * allocatedLabUnitsCount;

            if (subject.theoryHours > 0) {
                const relevantTheoryDivisions = getRelevantDivisionsForSubject(subject, allDivisionsInContext);
                totalExpectedTheoryLoad += subject.theoryHours * relevantTheoryDivisions.length;
                relevantTheoryDivisions.forEach(div => {
                    if (!allocatedTheoryDivisions.has(div.id)) {
                        unallocatedComponents.push({
                            subjectName: subject.name, subjectCode: subject.code,
                            type: 'Theory', unitName: div.name,
                            hours: subject.theoryHours
                        });
                    }
                });
            }

            if (subject.practicalHours > 0) {
                const relevantLabUnits = getRelevantLabUnitsForSubject(subject, allDivisionsInContext, allCustomLabGroupSetsInContext, studentElectiveChoicesInContext);
                totalExpectedPracticalLoad += subject.practicalHours * relevantLabUnits.length;
                
                relevantLabUnits.forEach(unit => {
                    const isAllocated = allocations.some(alloc =>
                        alloc.allocationType === SyllabusType.Lab &&
                        ( (unit.isCustomGroup && alloc.customLabBatchId === unit.id) || (!unit.isCustomGroup && alloc.batchId === unit.id && alloc.divisionId === unit.divisionId) )
                    );
                    if (!isAllocated) {
                        unallocatedComponents.push({
                            subjectName: subject.name, subjectCode: subject.code,
                            type: 'Lab', unitName: `${unit.name} ${unit.isCustomGroup ? '(Custom)' : `(Div: ${unit.divisionName})`}`,
                            hours: subject.practicalHours
                        });
                    }
                });
            }
        }
        
        const remainingTheoryLoad = Math.max(0, totalExpectedTheoryLoad - totalDepartmentTheoryLoadAllocated);
        const remainingPracticalLoad = Math.max(0, totalExpectedPracticalLoad - totalDepartmentPracticalLoadAllocated);
        const externalFacultyDetails = Array.from(externalFacultyMap.values());
        const externalFacultyCount = externalFacultyMap.size;

        res.status(200).json({
            departmentId: deptIdNum,
            departmentName: department.name,
            year: yearNum,
            semesterType: semesterType,
            calculatedSemester: calculatedSemester,
            totalDepartmentTheoryLoad: totalDepartmentTheoryLoadAllocated,
            totalDepartmentPracticalLoad: totalDepartmentPracticalLoadAllocated,
            grandTotalDepartmentLoad: totalDepartmentTheoryLoadAllocated + totalDepartmentPracticalLoadAllocated,
            remainingLoadTotal: remainingTheoryLoad + remainingPracticalLoad,
            remainingLoadDetails: {
                theory: remainingTheoryLoad,
                practical: remainingPracticalLoad,
                components: unallocatedComponents.sort((a,b) => a.subjectName.localeCompare(b.subjectName) || a.type.localeCompare(b.type))
            },
            externalFacultyCount: externalFacultyCount, // New field
            externalFacultyDetails: externalFacultyDetails // New field
        });

    } catch (error) {
        console.error("Get Department Load Calculation Error:", error);
        next(error);
    }
});

// Helper function to determine relevant divisions for a subject's theory lectures
function getRelevantDivisionsForSubject(subject, allDivisionsInContext) {
    if (subject.subjectType === SubjectType.Common) {
        return allDivisionsInContext.filter(d => d.divisionType === DivisionType.Permanent && (d.linkedSubjectType === SubjectType.Common || !d.linkedSubjectType));
    } else if (subject.subjectType === SubjectType.DLO || subject.subjectType === SubjectType.ILOT) {
        return allDivisionsInContext.filter(d => d.divisionType === DivisionType.Temporary && d.linkedSubjectType === subject.subjectType && d.courseCategory === (subject.courseCategory || ""));
    } else if (subject.subjectType === SubjectType.MajorMinor) {
         return allDivisionsInContext.filter(d => d.divisionType === DivisionType.Permanent && d.linkedSubjectType === SubjectType.MajorMinor && d.courseCategory === (subject.courseCategory || ""));
    }
    return [];
}

// Helper function to determine relevant lab units for a subject
function getRelevantLabUnitsForSubject(subject, allDivisionsInContext, allCustomLabGroupSetsInContext, studentElectiveChoices) {
    let relevantUnits = [];
    const applicableCustomLabSet = (allCustomLabGroupSetsInContext || []).find(cgls =>
        cgls.departmentId === subject.departmentId &&
        cgls.year === subject.year &&
        cgls.semester === subject.semester &&
        cgls.linkedSubjectType === subject.subjectType &&
        cgls.courseCategory === (subject.courseCategory || "")
    );

    if (applicableCustomLabSet && ['DLO', 'ILOT', 'MajorMinor'].includes(subject.subjectType)) {
        (applicableCustomLabSet.customLabBatches || []).forEach(clb => {
             const contextualDivision = allDivisionsInContext.find(div => 
                div.divisionType === DivisionType.Temporary &&
                div.departmentId === applicableCustomLabSet.departmentId &&
                div.year === applicableCustomLabSet.year &&
                div.semester === applicableCustomLabSet.semester &&
                div.linkedSubjectType === applicableCustomLabSet.linkedSubjectType &&
                div.courseCategory === applicableCustomLabSet.courseCategory
            );
            relevantUnits.push({ id: clb.id, name: clb.name, divisionId: contextualDivision?.id || applicableCustomLabSet.id, divisionName: contextualDivision?.name || `Set: ${subject.courseCategory}`, isCustomGroup: true });
        });
    } else {
        allDivisionsInContext.forEach(division => {
            if (division.divisionType === DivisionType.Permanent) {
                if (subject.subjectType === SubjectType.Common && (division.linkedSubjectType === SubjectType.Common || !division.linkedSubjectType)) {
                    (division.batches || []).forEach(batch => relevantUnits.push({ id: batch.id, name: batch.name, divisionId: division.id, divisionName: division.name, isCustomGroup: false }));
                } else if (subject.subjectType === SubjectType.MajorMinor && division.linkedSubjectType === SubjectType.MajorMinor && division.courseCategory === (subject.courseCategory || "")) {
                     (division.batches || []).forEach(batch => relevantUnits.push({ id: batch.id, name: batch.name, divisionId: division.id, divisionName: division.name, isCustomGroup: false }));
                }
            } else if (division.divisionType === DivisionType.Temporary && !applicableCustomLabSet) {
                 if ((subject.subjectType === SubjectType.DLO || subject.subjectType === SubjectType.ILOT) &&
                    division.linkedSubjectType === subject.subjectType &&
                    division.courseCategory === (subject.courseCategory || "")) {
                    (division.composedOfPermanentBatches || []).forEach(permBatch => {
                        const studentChoiceExists = (studentElectiveChoices || []).find(
                            sec => sec.batchId === permBatch.id && sec.subjectId === subject.id && sec.studentCount > 0
                        );
                        if (studentChoiceExists) {
                            relevantUnits.push({ id: permBatch.id, name: `${permBatch.name} (${permBatch.permanentDivision?.name})`, divisionId: division.id, divisionName: division.name, isCustomGroup: false });
                        }
                    });
                }
            }
        });
    }
    return Array.from(new Map(relevantUnits.map(item => [`${item.id}-${item.isCustomGroup}-${item.divisionId}`, item])).values());
}


// --- PUT Update Average Student Counts for a Subject ---
router.put('/:id/avg-students', authorize(UserRole.Admin), async (req, res, next) => {
    const { id } = req.params;
    const subjectId = parseInt(id);
    const { avgStudentsPerDivision, avgStudentsPerBatch } = req.body;

    if (isNaN(subjectId)) {
        return res.status(400).json({ message: 'Invalid Subject ID format.' });
    }

    const updateData = {};
    if (avgStudentsPerDivision !== undefined) {
        const avgDiv = parseInt(avgStudentsPerDivision);
        updateData.avgStudentsPerDivision = isNaN(avgDiv) || avgDiv < 0 ? null : avgDiv;
    }
    if (avgStudentsPerBatch !== undefined) {
        const avgBatch = parseInt(avgStudentsPerBatch);
        updateData.avgStudentsPerBatch = isNaN(avgBatch) || avgBatch < 0 ? null : avgBatch;
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'No average student count data provided for update.' });
    }

    try {
        const updatedSubject = await prisma.subject.update({
            where: { id: subjectId },
            data: updateData,
            select: {
                id: true,
                avgStudentsPerDivision: true,
                avgStudentsPerBatch: true
            }
        });
        res.status(200).json({ message: 'Average student counts updated successfully.', subject: updatedSubject });
    } catch (error) {
        console.error("Update Avg Student Counts Error:", error);
        if (error.code === 'P2025') {
            return res.status(404).json({ message: `Subject with ID ${subjectId} not found.` });
        }
        next(error);
    }
});

export default router;
