-- AlterTable
ALTER TABLE "PaymentAttempt" ADD COLUMN "apiKeyId" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "beneficiaryAccountId" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "codiId" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "expiresAt" DATETIME;
ALTER TABLE "PaymentAttempt" ADD COLUMN "numRef" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "providerTransactionId" TEXT;

-- CreateTable
CREATE TABLE "MockSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "codiId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "beneficiaryAccountId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "numRef" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "datePaid" DATETIME,
    CONSTRAINT "MockSubmission_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MerchantNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "MerchantNotification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
ALTER TABLE "Order" ADD COLUMN "fulfillmentStatus" TEXT NOT NULL DEFAULT 'RESERVED';
CREATE TABLE "new_OutboxEvent" (
    "effectKey" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" DATETIME,
    "leaseToken" TEXT,
    "deliveredAt" DATETIME,
    "lastError" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "OutboxEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OutboxEvent" ("createdAt", "id", "orderId", "payload", "status", "type") SELECT "createdAt", "id", "orderId", "payload", "status", "type" FROM "OutboxEvent";
DROP TABLE "OutboxEvent";
ALTER TABLE "new_OutboxEvent" RENAME TO "OutboxEvent";
CREATE UNIQUE INDEX "OutboxEvent_effectKey_key" ON "OutboxEvent"("effectKey");
CREATE INDEX "OutboxEvent_status_createdAt_idx" ON "OutboxEvent"("status", "createdAt");
ALTER TABLE "PaymentEvent" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "PaymentEvent" ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'RECORDED';
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "MockSubmission_transactionId_key" ON "MockSubmission"("transactionId");

-- CreateIndex
CREATE INDEX "MockSubmission_attemptId_idx" ON "MockSubmission"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantNotification_eventId_key" ON "MerchantNotification"("eventId");

-- CreateIndex
CREATE INDEX "MerchantNotification_merchantId_createdAt_idx" ON "MerchantNotification"("merchantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_providerTransactionId_key" ON "PaymentAttempt"("providerTransactionId");
