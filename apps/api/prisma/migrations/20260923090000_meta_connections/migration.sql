ALTER TABLE "Channel" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Channel" ALTER COLUMN "isMock" SET DEFAULT false;
CREATE UNIQUE INDEX "Channel_workspaceId_platform_externalId_key" ON "Channel"("workspaceId", "platform", "externalId");
ALTER TABLE "PublishAttempt" ADD COLUMN "dispatchStartedAt" TIMESTAMP(3);
CREATE TABLE "ChannelCredential" (
 "channelId" TEXT NOT NULL PRIMARY KEY,
 "encryptedToken" TEXT NOT NULL,
 "pageId" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3),
 "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ChannelCredential_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "MetaOAuth" (
 "stateHash" TEXT NOT NULL PRIMARY KEY,
 "workspaceId" TEXT NOT NULL,
 "sessionHash" TEXT NOT NULL,
 "consumedAt" TIMESTAMP(3),
 "payload" TEXT,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "MetaOAuth_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MetaOAuth_expiresAt_idx" ON "MetaOAuth"("expiresAt");
CREATE INDEX "MetaOAuth_sessionHash_idx" ON "MetaOAuth"("sessionHash");
-- Existing accounts, posts and scheduledAt values are preserved.
