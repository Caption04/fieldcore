/*
  Warnings:

  - You are about to drop the `JobPhoto` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "JobPhoto" DROP CONSTRAINT "JobPhoto_companyId_fkey";

-- DropForeignKey
ALTER TABLE "JobPhoto" DROP CONSTRAINT "JobPhoto_jobId_fkey";

-- DropTable
DROP TABLE "JobPhoto";
