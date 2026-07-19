-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN "leaveAt" DATETIME;

-- CreateTable
CREATE TABLE "MaterialReadReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "materialId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaterialReadReceipt_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaterialReadReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MaterialReadReceipt_userId_idx" ON "MaterialReadReceipt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialReadReceipt_materialId_userId_key" ON "MaterialReadReceipt"("materialId", "userId");
