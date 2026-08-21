-- CreateTable
CREATE TABLE "comment_threads" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "root_annotation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observed_comments" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "dws_comment_id" TEXT NOT NULL,
    "author_user_id" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observed_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_mentions" (
    "id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "mentioned_user_id" TEXT NOT NULL,
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_reply_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_reply_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "comment_threads_root_annotation_id_key" ON "comment_threads"("root_annotation_id");

-- CreateIndex
CREATE INDEX "comment_threads_document_id_idx" ON "comment_threads"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "observed_comments_dws_comment_id_key" ON "observed_comments"("dws_comment_id");

-- CreateIndex
CREATE INDEX "observed_comments_thread_id_idx" ON "observed_comments"("thread_id");

-- CreateIndex
CREATE INDEX "comment_mentions_mentioned_user_id_idx" ON "comment_mentions"("mentioned_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "comment_mentions_comment_id_mentioned_user_id_key" ON "comment_mentions"("comment_id", "mentioned_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "thread_reply_tokens_token_key" ON "thread_reply_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "thread_reply_tokens_thread_id_user_id_key" ON "thread_reply_tokens"("thread_id", "user_id");

-- AddForeignKey
ALTER TABLE "comment_threads" ADD CONSTRAINT "comment_threads_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observed_comments" ADD CONSTRAINT "observed_comments_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "comment_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "observed_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_reply_tokens" ADD CONSTRAINT "thread_reply_tokens_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "comment_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_reply_tokens" ADD CONSTRAINT "thread_reply_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
