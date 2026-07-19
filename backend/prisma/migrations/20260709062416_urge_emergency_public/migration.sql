-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SupervisionTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resolutionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "dueAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "urgeCount" INTEGER NOT NULL DEFAULT 0,
    "lastUrgeAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupervisionTask_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "Resolution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupervisionTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SupervisionTask" ("createdAt", "dueAt", "id", "ownerId", "resolutionId", "status", "title", "updatedAt") SELECT "createdAt", "dueAt", "id", "ownerId", "resolutionId", "status", "title", "updatedAt" FROM "SupervisionTask";
DROP TABLE "SupervisionTask";
ALTER TABLE "new_SupervisionTask" RENAME TO "SupervisionTask";
CREATE TABLE "new_Topic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collegeId" TEXT NOT NULL,
    "meetingId" TEXT,
    "meetingType" TEXT NOT NULL,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "proposerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "needPartyPrecheck" BOOLEAN NOT NULL DEFAULT false,
    "relatedPartyResolutionId" TEXT,
    "isMajor" BOOLEAN NOT NULL DEFAULT false,
    "isTempMotion" BOOLEAN NOT NULL DEFAULT false,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "avoidUserIds" TEXT NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Topic_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Topic_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Topic_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CategoryDict" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Topic_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Topic" ("avoidUserIds", "categoryId", "collegeId", "content", "createdAt", "id", "isMajor", "isTempMotion", "meetingId", "meetingType", "needPartyPrecheck", "proposerId", "relatedPartyResolutionId", "sortOrder", "status", "title", "updatedAt") SELECT "avoidUserIds", "categoryId", "collegeId", "content", "createdAt", "id", "isMajor", "isTempMotion", "meetingId", "meetingType", "needPartyPrecheck", "proposerId", "relatedPartyResolutionId", "sortOrder", "status", "title", "updatedAt" FROM "Topic";
DROP TABLE "Topic";
ALTER TABLE "new_Topic" RENAME TO "Topic";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
