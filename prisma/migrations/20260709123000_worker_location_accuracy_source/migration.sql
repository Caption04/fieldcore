-- Add real technician GPS metadata for the live admin map.
ALTER TABLE "WorkerLocation" ADD COLUMN IF NOT EXISTS "accuracyMeters" DOUBLE PRECISION;
ALTER TABLE "WorkerLocation" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'MOBILE_APP';
