-- CreateEnum
CREATE TYPE "QuoteSource" AS ENUM ('WEBSITE_FORM', 'AI_AGENT');

-- CreateEnum
CREATE TYPE "AILeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'CONTACTED', 'IN_PROGRESS', 'CONVERTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AILeadScore" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "AIMessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "AIKnowledgeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AIEventType" AS ENUM ('CHAT_OPENED', 'MESSAGE_SENT', 'PRODUCT_RECOMMENDED', 'PRODUCT_VIEWED', 'QUOTE_STARTED', 'QUOTE_SUBMITTED', 'WHATSAPP_CLICKED', 'HUMAN_ESCALATION', 'CONVERSATION_COMPLETED');

-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN     "aiConversationId" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "source" "QuoteSource" NOT NULL DEFAULT 'WEBSITE_FORM';

-- CreateTable
CREATE TABLE "AIConversation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "customerName" TEXT,
    "company" TEXT,
    "country" TEXT,
    "email" TEXT,
    "whatsapp" TEXT,
    "productId" TEXT,
    "categoryId" TEXT,
    "quantity" INTEGER,
    "size" TEXT,
    "customizationRequired" BOOLEAN,
    "requirements" TEXT,
    "status" "AILeadStatus" NOT NULL DEFAULT 'NEW',
    "leadScore" "AILeadScore" NOT NULL DEFAULT 'LOW',
    "escalatedAt" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AIMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolName" TEXT,
    "metadata" JSONB,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIKnowledge" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "status" "AIKnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIEvent" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "eventType" "AIEventType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIConversation_sessionId_key" ON "AIConversation"("sessionId");

-- CreateIndex
CREATE INDEX "AIConversation_status_idx" ON "AIConversation"("status");

-- CreateIndex
CREATE INDEX "AIConversation_leadScore_idx" ON "AIConversation"("leadScore");

-- CreateIndex
CREATE INDEX "AIConversation_createdAt_idx" ON "AIConversation"("createdAt");

-- CreateIndex
CREATE INDEX "AIConversation_status_leadScore_createdAt_idx" ON "AIConversation"("status", "leadScore", "createdAt");

-- CreateIndex
CREATE INDEX "AIMessage_conversationId_createdAt_idx" ON "AIMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AIKnowledge_status_priority_idx" ON "AIKnowledge"("status", "priority");

-- CreateIndex
CREATE INDEX "AIKnowledge_category_idx" ON "AIKnowledge"("category");

-- CreateIndex
CREATE INDEX "AIEvent_eventType_createdAt_idx" ON "AIEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AIEvent_conversationId_idx" ON "AIEvent"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_reference_key" ON "QuoteRequest"("reference");

-- CreateIndex
CREATE INDEX "QuoteRequest_source_idx" ON "QuoteRequest"("source");

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_aiConversationId_fkey" FOREIGN KEY ("aiConversationId") REFERENCES "AIConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIEvent" ADD CONSTRAINT "AIEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

