-- CreateTable
CREATE TABLE "SchoolFeedbackThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collegeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "subject" TEXT,
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolFeedbackThread_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SchoolFeedbackThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchoolFeedbackMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolFeedbackMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "SchoolFeedbackThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SchoolFeedbackMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SchoolFeedbackThread_collegeId_lastMessageAt_idx" ON "SchoolFeedbackThread"("collegeId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "SchoolFeedbackThread_createdById_idx" ON "SchoolFeedbackThread"("createdById");

-- CreateIndex
CREATE INDEX "SchoolFeedbackMessage_threadId_createdAt_idx" ON "SchoolFeedbackMessage"("threadId", "createdAt");
