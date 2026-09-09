-- CreateEnum
CREATE TYPE "RfqPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "followUpAt" TIMESTAMP(3),
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "priority" "RfqPriority" NOT NULL DEFAULT 'NORMAL';

-- CreateIndex
CREATE INDEX "QuoteRequest_assignedToId_idx" ON "QuoteRequest"("assignedToId");

-- CreateIndex
CREATE INDEX "QuoteRequest_priority_status_createdAt_idx" ON "QuoteRequest"("priority", "status", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteRequest_followUpAt_idx" ON "QuoteRequest"("followUpAt");

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

