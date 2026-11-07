ALTER TABLE "PaymentAttempt" ADD COLUMN "providerBankAccountId" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "expectedSnapshotHash" TEXT;
ALTER TABLE "PeyWebhookInbox" ADD COLUMN "processingAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PeyWebhookInbox" ADD COLUMN "processedAt" DATETIME;
ALTER TABLE "PeyWebhookInbox" ADD COLUMN "leaseUntil" DATETIME;
ALTER TABLE "PeyWebhookInbox" ADD COLUMN "leaseToken" TEXT;
ALTER TABLE "PeyWebhookInbox" ADD COLUMN "nextAttemptAt" DATETIME;
ALTER TABLE "PeyWebhookInbox" ADD COLUMN "lastError" TEXT;
ALTER TABLE "ProviderTransaction" ADD COLUMN "datePaid" DATETIME;
