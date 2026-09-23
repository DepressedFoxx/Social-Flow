DROP INDEX "Channel_workspaceId_platform_key";
CREATE INDEX "Channel_workspaceId_platform_idx" ON "Channel"("workspaceId", "platform");
ALTER TABLE "Channel" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "PublishAttempt" (
 "id" TEXT NOT NULL, "postId" TEXT NOT NULL, "scheduleVersion" INTEGER NOT NULL,
 "status" TEXT NOT NULL, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "finishedAt" TIMESTAMP(3), "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
 "errorCode" TEXT, "errorMessage" TEXT, "externalPostId" TEXT,
 CONSTRAINT "PublishAttempt_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PublishAttempt_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PublishAttempt_postId_scheduleVersion_key" ON "PublishAttempt"("postId", "scheduleVersion");
CREATE INDEX "PublishAttempt_status_leaseExpiresAt_idx" ON "PublishAttempt"("status", "leaseExpiresAt");
