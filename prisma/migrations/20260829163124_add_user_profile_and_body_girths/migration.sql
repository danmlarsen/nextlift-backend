-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE');

-- CreateEnum
CREATE TYPE "WeightGoal" AS ENUM ('LOSE', 'MAINTAIN', 'GAIN');

-- AlterTable
ALTER TABLE "BodyMeasurement" ADD COLUMN     "armCm" DOUBLE PRECISION,
ADD COLUMN     "calfCm" DOUBLE PRECISION,
ADD COLUMN     "chestCm" DOUBLE PRECISION,
ADD COLUMN     "hipsCm" DOUBLE PRECISION,
ADD COLUMN     "neckCm" DOUBLE PRECISION,
ADD COLUMN     "thighCm" DOUBLE PRECISION,
ADD COLUMN     "waistCm" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "heightCm" DOUBLE PRECISION,
    "birthDate" DATE,
    "sex" "Sex",
    "activityLevel" "ActivityLevel",
    "goalWeight" DOUBLE PRECISION,
    "weightGoal" "WeightGoal",

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
