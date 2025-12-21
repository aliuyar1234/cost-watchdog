-- AlterTable
ALTER TABLE "users" ADD COLUMN "notification_settings" JSONB;

-- CreateTable
CREATE TABLE "daily_digests" (
    "id" UUID NOT NULL,
    "digest_key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "user_id" UUID,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_digests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_digests_digest_key_channel_recipient_key" ON "daily_digests"("digest_key", "channel", "recipient");

-- CreateIndex
CREATE INDEX "daily_digests_digest_key_channel_idx" ON "daily_digests"("digest_key", "channel");

-- CreateIndex
CREATE INDEX "daily_digests_created_at_idx" ON "daily_digests"("created_at");

-- AddForeignKey
ALTER TABLE "daily_digests" ADD CONSTRAINT "daily_digests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
