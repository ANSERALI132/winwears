-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ProductionStage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRun" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ProductionStatus" NOT NULL DEFAULT 'PLANNED',
    "orderId" TEXT,
    "orderItemId" TEXT,
    "productId" TEXT,
    "quantityPlanned" INTEGER NOT NULL,
    "currentStageId" TEXT,
    "ownerId" TEXT,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "notes" TEXT,
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOutput" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stageId" TEXT,
    "quantityGood" INTEGER NOT NULL DEFAULT 0,
    "quantityRejected" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT,
    "fromStatus" "ProductionStatus",
    "toStatus" "ProductionStatus",
    "byUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionStage_slug_key" ON "ProductionStage"("slug");

-- CreateIndex
CREATE INDEX "ProductionStage_displayOrder_idx" ON "ProductionStage"("displayOrder");

-- CreateIndex
CREATE INDEX "ProductionStage_active_idx" ON "ProductionStage"("active");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRun_reference_key" ON "ProductionRun"("reference");

-- CreateIndex
CREATE INDEX "ProductionRun_status_idx" ON "ProductionRun"("status");

-- CreateIndex
CREATE INDEX "ProductionRun_orderId_idx" ON "ProductionRun"("orderId");

-- CreateIndex
CREATE INDEX "ProductionRun_currentStageId_idx" ON "ProductionRun"("currentStageId");

-- CreateIndex
CREATE INDEX "ProductionRun_plannedEnd_idx" ON "ProductionRun"("plannedEnd");

-- CreateIndex
CREATE INDEX "ProductionRun_status_plannedEnd_idx" ON "ProductionRun"("status", "plannedEnd");

-- CreateIndex
CREATE INDEX "ProductionRun_createdAt_idx" ON "ProductionRun"("createdAt");

-- CreateIndex
CREATE INDEX "ProductionOutput_runId_recordedAt_idx" ON "ProductionOutput"("runId", "recordedAt");

-- CreateIndex
CREATE INDEX "ProductionEvent_runId_createdAt_idx" ON "ProductionEvent"("runId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "ProductionStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOutput" ADD CONSTRAINT "ProductionOutput_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOutput" ADD CONSTRAINT "ProductionOutput_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProductionStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOutput" ADD CONSTRAINT "ProductionOutput_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEvent" ADD CONSTRAINT "ProductionEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEvent" ADD CONSTRAINT "ProductionEvent_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "ProductionStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEvent" ADD CONSTRAINT "ProductionEvent_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "ProductionStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEvent" ADD CONSTRAINT "ProductionEvent_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
