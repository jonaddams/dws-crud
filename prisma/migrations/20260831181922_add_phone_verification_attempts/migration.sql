-- CreateTable
CREATE TABLE "phone_verification_attempts" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_verification_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phone_verification_attempts_phone_idx" ON "phone_verification_attempts"("phone");
