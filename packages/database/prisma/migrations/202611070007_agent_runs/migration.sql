CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buyerId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "createdAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "AgentRun_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AgentRun_buyerId_key_key" ON "AgentRun"("buyerId", "key");
