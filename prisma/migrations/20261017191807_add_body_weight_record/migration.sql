-- CreateTable
CREATE TABLE "BodyWeightRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weightLbs" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyWeightRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BodyWeightRecord_userId_recordedAt_idx" ON "BodyWeightRecord"("userId", "recordedAt");

-- AddForeignKey
ALTER TABLE "BodyWeightRecord" ADD CONSTRAINT "BodyWeightRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
