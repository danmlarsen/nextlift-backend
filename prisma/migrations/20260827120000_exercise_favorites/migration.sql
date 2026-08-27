-- CreateTable
CREATE TABLE "ExerciseFavorite" (
    "userId" INTEGER NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseFavorite_pkey" PRIMARY KEY ("userId", "exerciseId")
);

-- CreateIndex
CREATE INDEX "ExerciseFavorite_exerciseId_idx" ON "ExerciseFavorite"("exerciseId");

-- AddForeignKey
ALTER TABLE "ExerciseFavorite" ADD CONSTRAINT "ExerciseFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseFavorite" ADD CONSTRAINT "ExerciseFavorite_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
