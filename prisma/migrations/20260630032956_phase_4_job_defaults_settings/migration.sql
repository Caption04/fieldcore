-- AlterTable
ALTER TABLE "CompanySchedulingSettings" ADD COLUMN     "autoCreateScheduleOnAssign" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "defaultJobStatus" "JobStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "requireCompletionNotes" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requireProofPhotos" BOOLEAN NOT NULL DEFAULT true;
