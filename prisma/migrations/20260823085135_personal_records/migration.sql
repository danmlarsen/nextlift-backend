/*
  Warnings:

  - Added the required column `achievedAt` to the `PersonalRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `value` to the `PersonalRecord` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `recordType` on the `PersonalRecord` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "RecordType" AS ENUM ('MAX_WEIGHT', 'ONE_REP_MAX', 'MAX_SET_VOLUME');

-- AlterTable
ALTER TABLE "PersonalRecord" ADD COLUMN     "achievedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "value" DOUBLE PRECISION NOT NULL,
DROP COLUMN "recordType",
ADD COLUMN     "recordType" "RecordType" NOT NULL;

-- CreateIndex
CREATE INDEX "PersonalRecord_workoutSetId_idx" ON "PersonalRecord"("workoutSetId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalRecord_userId_exerciseId_recordType_key" ON "PersonalRecord"("userId", "exerciseId", "recordType");

-- CreateIndex
CREATE INDEX "Workout_userId_status_startedAt_idx" ON "Workout"("userId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "WorkoutExercise_workoutId_idx" ON "WorkoutExercise"("workoutId");

-- CreateIndex
CREATE INDEX "WorkoutExercise_exerciseId_idx" ON "WorkoutExercise"("exerciseId");

-- CreateIndex
CREATE INDEX "WorkoutSet_workoutExerciseId_idx" ON "WorkoutSet"("workoutExerciseId");

-- Backfill current personal records from existing workout history.
-- Eligibility matches PersonalRecordsService: completed sets, not warmups,
-- weight > 0 (plus reps > 0 for rep-based records), any workout status.
-- Tie-break: highest value, then earliest workout, then lowest set id.

-- MAX_WEIGHT
INSERT INTO "PersonalRecord" ("userId", "exerciseId", "recordType", "value", "achievedAt", "workoutSetId")
SELECT DISTINCT ON (w."userId", we."exerciseId")
  w."userId", we."exerciseId", 'MAX_WEIGHT'::"RecordType",
  ws."weight", w."startedAt", ws."id"
FROM "WorkoutSet" ws
JOIN "WorkoutExercise" we ON we."id" = ws."workoutExerciseId"
JOIN "Workout" w ON w."id" = we."workoutId"
WHERE ws."completed" = true
  AND ws."type" <> 'warmup'
  AND ws."weight" > 0
ORDER BY w."userId", we."exerciseId", ws."weight" DESC, w."startedAt" ASC, ws."id" ASC
ON CONFLICT ("userId", "exerciseId", "recordType") DO NOTHING;

-- ONE_REP_MAX (Epley, mirrors calculateOneRepMax in src/common/utils.ts)
INSERT INTO "PersonalRecord" ("userId", "exerciseId", "recordType", "value", "achievedAt", "workoutSetId")
SELECT DISTINCT ON (w."userId", we."exerciseId")
  w."userId", we."exerciseId", 'ONE_REP_MAX'::"RecordType",
  CASE WHEN ws."reps" = 1 THEN ws."weight" ELSE ws."weight" * (1 + ws."reps" / 30.0) END,
  w."startedAt", ws."id"
FROM "WorkoutSet" ws
JOIN "WorkoutExercise" we ON we."id" = ws."workoutExerciseId"
JOIN "Workout" w ON w."id" = we."workoutId"
WHERE ws."completed" = true
  AND ws."type" <> 'warmup'
  AND ws."weight" > 0
  AND ws."reps" > 0
ORDER BY w."userId", we."exerciseId",
  CASE WHEN ws."reps" = 1 THEN ws."weight" ELSE ws."weight" * (1 + ws."reps" / 30.0) END DESC,
  w."startedAt" ASC, ws."id" ASC
ON CONFLICT ("userId", "exerciseId", "recordType") DO NOTHING;

-- MAX_SET_VOLUME
INSERT INTO "PersonalRecord" ("userId", "exerciseId", "recordType", "value", "achievedAt", "workoutSetId")
SELECT DISTINCT ON (w."userId", we."exerciseId")
  w."userId", we."exerciseId", 'MAX_SET_VOLUME'::"RecordType",
  ws."weight" * ws."reps", w."startedAt", ws."id"
FROM "WorkoutSet" ws
JOIN "WorkoutExercise" we ON we."id" = ws."workoutExerciseId"
JOIN "Workout" w ON w."id" = we."workoutId"
WHERE ws."completed" = true
  AND ws."type" <> 'warmup'
  AND ws."weight" > 0
  AND ws."reps" > 0
ORDER BY w."userId", we."exerciseId", ws."weight" * ws."reps" DESC, w."startedAt" ASC, ws."id" ASC
ON CONFLICT ("userId", "exerciseId", "recordType") DO NOTHING;
