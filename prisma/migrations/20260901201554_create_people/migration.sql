-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "image_url" TEXT,
    "state" VARCHAR(2) NOT NULL,
    "party" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "people_external_id_key" ON "people"("external_id");

-- CreateIndex
CREATE INDEX "people_state_idx" ON "people"("state");

-- CreateIndex
CREATE INDEX "people_party_idx" ON "people"("party");
