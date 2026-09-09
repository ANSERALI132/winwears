-- CreateEnum
CREATE TYPE "QcCheckKind" AS ENUM ('MEASUREMENT', 'OBSERVATION');

-- CreateEnum
CREATE TYPE "QcResultKind" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'CONCESSION');

-- CreateTable
CREATE TABLE "QcCheckpoint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "kind" "QcCheckKind" NOT NULL DEFAULT 'OBSERVATION',
    "unit" TEXT,
    "minValue" DECIMAL(12,3),
    "maxValue" DECIMAL(12,3),
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QcCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QcInspection" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "runId" TEXT,
    "orderId" TEXT,
    "stageId" TEXT,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "quantityPassed" INTEGER NOT NULL DEFAULT 0,
    "quantityFailed" INTEGER NOT NULL DEFAULT 0,
    "result" "QcResultKind" NOT NULL DEFAULT 'PENDING',
    "overrideResult" "QcResultKind",
    "overrideReason" TEXT,
    "decidedById" TEXT,
    "inspectorId" TEXT,
    "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QcInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QcResult" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "value" DECIMAL(12,3),
    "passed" BOOLEAN NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QcResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QcCheckpoint_slug_key" ON "QcCheckpoint"("slug");

-- CreateIndex
CREATE INDEX "QcCheckpoint_displayOrder_idx" ON "QcCheckpoint"("displayOrder");

-- CreateIndex
CREATE INDEX "QcCheckpoint_active_idx" ON "QcCheckpoint"("active");

-- CreateIndex
CREATE UNIQUE INDEX "QcInspection_reference_key" ON "QcInspection"("reference");

-- CreateIndex
CREATE INDEX "QcInspection_result_idx" ON "QcInspection"("result");

-- CreateIndex
CREATE INDEX "QcInspection_runId_idx" ON "QcInspection"("runId");

-- CreateIndex
CREATE INDEX "QcInspection_orderId_idx" ON "QcInspection"("orderId");

-- CreateIndex
CREATE INDEX "QcInspection_inspectedAt_idx" ON "QcInspection"("inspectedAt");

-- CreateIndex
CREATE INDEX "QcInspection_result_inspectedAt_idx" ON "QcInspection"("result", "inspectedAt");

-- CreateIndex
CREATE INDEX "QcResult_checkpointId_idx" ON "QcResult"("checkpointId");

-- CreateIndex
CREATE UNIQUE INDEX "QcResult_inspectionId_checkpointId_key" ON "QcResult"("inspectionId", "checkpointId");

-- AddForeignKey
ALTER TABLE "QcInspection" ADD CONSTRAINT "QcInspection_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcInspection" ADD CONSTRAINT "QcInspection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcInspection" ADD CONSTRAINT "QcInspection_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProductionStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcInspection" ADD CONSTRAINT "QcInspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcInspection" ADD CONSTRAINT "QcInspection_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcInspection" ADD CONSTRAINT "QcInspection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcResult" ADD CONSTRAINT "QcResult_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "QcInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcResult" ADD CONSTRAINT "QcResult_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "QcCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
