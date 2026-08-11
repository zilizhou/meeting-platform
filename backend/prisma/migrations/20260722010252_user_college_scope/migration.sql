-- CreateTable
CREATE TABLE "UserCollegeScope" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserCollegeScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserCollegeScope_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UserCollegeScope_userId_idx" ON "UserCollegeScope"("userId");

-- CreateIndex
CREATE INDEX "UserCollegeScope_collegeId_idx" ON "UserCollegeScope"("collegeId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCollegeScope_userId_collegeId_key" ON "UserCollegeScope"("userId", "collegeId");
