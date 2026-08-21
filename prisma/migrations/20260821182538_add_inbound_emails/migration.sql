-- CreateTable
CREATE TABLE "inbound_emails" (
    "id" TEXT NOT NULL,
    "provider_message_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "user_id" TEXT,
    "dws_comment_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inbound_emails_provider_message_id_key" ON "inbound_emails"("provider_message_id");
