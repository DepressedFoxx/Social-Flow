-- AlterTable
ALTER TABLE "Post" ADD COLUMN "clientRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Post_workspaceId_clientRequestId_key" ON "Post"("workspaceId", "clientRequestId");
