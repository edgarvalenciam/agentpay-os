-- Verified inbound evidence only; this endpoint never submits or confirms payments.
CREATE TABLE "PeyWebhookInbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VERIFIED_PENDING_RECONCILIATION',
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PeyWebhookInbox_deliveryId_key" ON "PeyWebhookInbox"("deliveryId");
