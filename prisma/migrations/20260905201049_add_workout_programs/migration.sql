-- CreateEnum
CREATE TYPE "ProgramGoal" AS ENUM ('STRENGTH', 'HYPERTROPHY', 'GENERAL_FITNESS', 'POWERLIFTING', 'ENDURANCE', 'ATHLETIC');

-- CreateEnum
CREATE TYPE "ProgramLevel" AS ENUM ('BEGINNER', 'NOVICE', 'INTERMEDIATE', 'ADVANCED', 'ELITE');

-- CreateEnum
CREATE TYPE "ProgramScheduleMode" AS ENUM ('SEQUENCE', 'CALENDAR');

-- CreateEnum
CREATE TYPE "ProgramDurationMode" AS ENUM ('FIXED', 'OPEN_ENDED');

-- CreateEnum
CREATE TYPE "ProgramVisibility" AS ENUM ('PRIVATE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EffortScale" AS ENUM ('RPE', 'RIR');

-- CreateEnum
CREATE TYPE "ProgressionStrategy" AS ENUM ('NONE', 'LINEAR', 'DOUBLE', 'PERCENT_TM', 'RPE');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ProgramDayLogStatus" AS ENUM ('STARTED', 'COMPLETED', 'SKIPPED');

-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "programDayLogId" INTEGER;

-- AlterTable
ALTER TABLE "WorkoutExercise" ADD COLUMN     "progressionKey" TEXT;

-- AlterTable
ALTER TABLE "WorkoutSet" ADD COLUMN     "programSetId" INTEGER,
ADD COLUMN     "rpe" DOUBLE PRECISION,
ADD COLUMN     "suggestedAmrap" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suggestedRepsMax" INTEGER,
ADD COLUMN     "suggestedRestSeconds" INTEGER,
ADD COLUMN     "suggestedRpe" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Program" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "slug" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "credit" TEXT,
    "goal" "ProgramGoal" NOT NULL,
    "level" "ProgramLevel" NOT NULL,
    "scheduleMode" "ProgramScheduleMode" NOT NULL DEFAULT 'SEQUENCE',
    "durationMode" "ProgramDurationMode" NOT NULL DEFAULT 'FIXED',
    "daysPerWeek" INTEGER NOT NULL,
    "effortScale" "EffortScale" NOT NULL DEFAULT 'RPE',
    "visibility" "ProgramVisibility" NOT NULL DEFAULT 'PRIVATE',
    "shareToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramBlock" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "blockOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "focus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramWeek" (
    "id" SERIAL NOT NULL,
    "blockId" INTEGER NOT NULL,
    "weekInBlock" INTEGER NOT NULL,
    "label" TEXT,
    "isDeload" BOOLEAN NOT NULL DEFAULT false,
    "volumeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "intensityMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "ProgramWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramDay" (
    "id" SERIAL NOT NULL,
    "blockId" INTEGER NOT NULL,
    "dayOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "weekday" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramExercise" (
    "id" SERIAL NOT NULL,
    "dayId" INTEGER NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "exerciseOrder" INTEGER NOT NULL,
    "progressionKey" TEXT NOT NULL,
    "strategy" "ProgressionStrategy" NOT NULL DEFAULT 'NONE',
    "progression" JSONB,
    "roundingKg" DOUBLE PRECISION,
    "restSeconds" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramSet" (
    "id" SERIAL NOT NULL,
    "programExerciseId" INTEGER NOT NULL,
    "weekInBlock" INTEGER,
    "setOrder" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'normal',
    "repsMin" INTEGER,
    "repsMax" INTEGER,
    "isAmrap" BOOLEAN NOT NULL DEFAULT false,
    "percent" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "targetRpe" DOUBLE PRECISION,
    "restSeconds" INTEGER,
    "duration" INTEGER,
    "notes" TEXT,

    CONSTRAINT "ProgramSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramEnrollment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "programId" INTEGER,
    "programVersion" INTEGER NOT NULL,
    "programName" TEXT NOT NULL,
    "totalWeeks" INTEGER NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "snapshot" JSONB NOT NULL,
    "startDate" DATE NOT NULL,
    "weekdayMap" JSONB,
    "currentCycle" INTEGER NOT NULL DEFAULT 1,
    "currentWeekIndex" INTEGER NOT NULL DEFAULT 1,
    "currentDayIndex" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramEnrollmentExerciseState" (
    "id" SERIAL NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "progressionKey" TEXT NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "originalExerciseId" INTEGER NOT NULL,
    "workingWeight" DOUBLE PRECISION,
    "trainingMax" DOUBLE PRECISION,
    "e1rm" DOUBLE PRECISION,
    "stageIndex" INTEGER NOT NULL DEFAULT 0,
    "consecutiveFails" INTEGER NOT NULL DEFAULT 0,
    "repsOffset" INTEGER NOT NULL DEFAULT 0,
    "roundingKg" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramEnrollmentExerciseState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramEnrollmentDayLog" (
    "id" SERIAL NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "cycle" INTEGER NOT NULL,
    "weekIndex" INTEGER NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "programDayId" INTEGER NOT NULL,
    "dayName" TEXT NOT NULL,
    "status" "ProgramDayLogStatus" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramEnrollmentDayLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Program_shareToken_key" ON "Program"("shareToken");

-- CreateIndex
CREATE INDEX "Program_userId_updatedAt_idx" ON "Program"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Program_visibility_level_goal_daysPerWeek_idx" ON "Program"("visibility", "level", "goal", "daysPerWeek");

-- CreateIndex
CREATE UNIQUE INDEX "Program_userId_slug_key" ON "Program"("userId", "slug");

-- CreateIndex
CREATE INDEX "ProgramBlock_programId_idx" ON "ProgramBlock"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramWeek_blockId_weekInBlock_key" ON "ProgramWeek"("blockId", "weekInBlock");

-- CreateIndex
CREATE INDEX "ProgramDay_blockId_idx" ON "ProgramDay"("blockId");

-- CreateIndex
CREATE INDEX "ProgramExercise_dayId_idx" ON "ProgramExercise"("dayId");

-- CreateIndex
CREATE INDEX "ProgramExercise_exerciseId_idx" ON "ProgramExercise"("exerciseId");

-- CreateIndex
CREATE INDEX "ProgramSet_programExerciseId_idx" ON "ProgramSet"("programExerciseId");

-- CreateIndex
CREATE INDEX "ProgramEnrollment_userId_status_idx" ON "ProgramEnrollment"("userId", "status");

-- CreateIndex
CREATE INDEX "ProgramEnrollment_programId_idx" ON "ProgramEnrollment"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramEnrollmentExerciseState_enrollmentId_progressionKey_key" ON "ProgramEnrollmentExerciseState"("enrollmentId", "progressionKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramEnrollmentDayLog_enrollmentId_cycle_weekIndex_dayInd_key" ON "ProgramEnrollmentDayLog"("enrollmentId", "cycle", "weekIndex", "dayIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Workout_programDayLogId_key" ON "Workout"("programDayLogId");

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_programDayLogId_fkey" FOREIGN KEY ("programDayLogId") REFERENCES "ProgramEnrollmentDayLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramBlock" ADD CONSTRAINT "ProgramBlock_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramWeek" ADD CONSTRAINT "ProgramWeek_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ProgramBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDay" ADD CONSTRAINT "ProgramDay_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ProgramBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramExercise" ADD CONSTRAINT "ProgramExercise_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "ProgramDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramExercise" ADD CONSTRAINT "ProgramExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSet" ADD CONSTRAINT "ProgramSet_programExerciseId_fkey" FOREIGN KEY ("programExerciseId") REFERENCES "ProgramExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramEnrollment" ADD CONSTRAINT "ProgramEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramEnrollment" ADD CONSTRAINT "ProgramEnrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramEnrollmentExerciseState" ADD CONSTRAINT "ProgramEnrollmentExerciseState_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ProgramEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramEnrollmentDayLog" ADD CONSTRAINT "ProgramEnrollmentDayLog_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ProgramEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

