-- CreateTable
CREATE TABLE "AiGeneration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collegeId" TEXT,
    "topicId" TEXT,
    "meetingId" TEXT,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL DEFAULT 'v1',
    "inputDigest" TEXT,
    "outputText" TEXT NOT NULL,
    "metaJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AiGeneration_topicId_kind_createdAt_idx" ON "AiGeneration"("topicId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AiGeneration_collegeId_createdAt_idx" ON "AiGeneration"("collegeId", "createdAt");
