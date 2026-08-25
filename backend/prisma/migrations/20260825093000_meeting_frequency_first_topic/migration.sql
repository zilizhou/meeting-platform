-- CreateTable
CREATE TABLE "MeetingFrequencyRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collegeId" TEXT NOT NULL DEFAULT '',
    "meetingType" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'SEMESTER',
    "requiredCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingFrequencyRule_collegeId_meetingType_key" ON "MeetingFrequencyRule"("collegeId", "meetingType");

INSERT INTO "MeetingFrequencyRule" ("id", "collegeId", "meetingType", "period", "requiredCount", "createdAt", "updatedAt")
VALUES
  ('freq_default_party', '', 'PARTY_COMMITTEE', 'SEMESTER', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('freq_default_joint', '', 'JOINT_CONFERENCE', 'SEMESTER', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "CategoryDict" ("id", "meetingType", "code", "name", "needPrecheck", "sortOrder")
SELECT 'cat_first_topic', 'PARTY_COMMITTEE', 'FIRST_TOPIC', '第一议题（政治理论学习）', 0, 0
WHERE NOT EXISTS (
  SELECT 1 FROM "CategoryDict" WHERE "meetingType" = 'PARTY_COMMITTEE' AND "code" = 'FIRST_TOPIC'
);
