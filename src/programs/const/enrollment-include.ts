import { Prisma } from '@prisma/client';

export const ENROLLMENT_INCLUDE = {
  states: { orderBy: { id: 'asc' } },
  dayLogs: {
    orderBy: [{ cycle: 'asc' }, { weekIndex: 'asc' }, { dayIndex: 'asc' }],
    include: {
      workout: { select: { id: true, status: true, startedAt: true } },
    },
  },
} satisfies Prisma.ProgramEnrollmentInclude;

export type EnrollmentWithDetails = Prisma.ProgramEnrollmentGetPayload<{
  include: typeof ENROLLMENT_INCLUDE;
}>;

/** List shape: everything but the (large) snapshot. */
export const ENROLLMENT_SUMMARY_SELECT = {
  id: true,
  programId: true,
  programVersion: true,
  programName: true,
  totalWeeks: true,
  status: true,
  startDate: true,
  currentCycle: true,
  currentWeekIndex: true,
  currentDayIndex: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProgramEnrollmentSelect;
