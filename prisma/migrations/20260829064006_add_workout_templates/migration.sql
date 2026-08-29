-- AlterTable
ALTER TABLE "WorkoutSet" ADD COLUMN     "suggestedDuration" INTEGER,
ADD COLUMN     "suggestedReps" INTEGER,
ADD COLUMN     "suggestedWeight" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "WorkoutTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "WorkoutTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutTemplateExercise" (
    "id" SERIAL NOT NULL,
    "workoutTemplateId" INTEGER NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "exerciseOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "WorkoutTemplateExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutTemplateSet" (
    "id" SERIAL NOT NULL,
    "workoutTemplateExerciseId" INTEGER NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "type" TEXT NOT NULL DEFAULT 'normal',
    "reps" INTEGER,
    "weight" DOUBLE PRECISION,
    "duration" INTEGER,

    CONSTRAINT "WorkoutTemplateSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkoutTemplate_userId_idx" ON "WorkoutTemplate"("userId");

-- CreateIndex
CREATE INDEX "WorkoutTemplateExercise_workoutTemplateId_idx" ON "WorkoutTemplateExercise"("workoutTemplateId");

-- CreateIndex
CREATE INDEX "WorkoutTemplateExercise_exerciseId_idx" ON "WorkoutTemplateExercise"("exerciseId");

-- CreateIndex
CREATE INDEX "WorkoutTemplateSet_workoutTemplateExerciseId_idx" ON "WorkoutTemplateSet"("workoutTemplateExerciseId");

-- AddForeignKey
ALTER TABLE "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplateExercise" ADD CONSTRAINT "WorkoutTemplateExercise_workoutTemplateId_fkey" FOREIGN KEY ("workoutTemplateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplateExercise" ADD CONSTRAINT "WorkoutTemplateExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplateSet" ADD CONSTRAINT "WorkoutTemplateSet_workoutTemplateExerciseId_fkey" FOREIGN KEY ("workoutTemplateExerciseId") REFERENCES "WorkoutTemplateExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
