const { prisma } = require('../../db');

function monthParts(date = new Date()) {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

async function recordStorageObject(input) {
  const date = input.createdAt ? new Date(input.createdAt) : new Date();
  const parts = monthParts(date);
  const object = await prisma.storageObject.create({
    data: {
      companyId: input.companyId,
      integrationConnectionId: input.integrationConnectionId || null,
      provider: input.provider || 'CLOUDFLARE_R2',
      bucket: input.bucket,
      objectKey: input.objectKey,
      safeUrl: input.safeUrl || null,
      fileName: input.fileName || null,
      mimeType: input.mimeType || null,
      sizeBytes: BigInt(input.sizeBytes || 0),
      checksum: input.checksum || null,
      bookingId: input.bookingId || null,
      jobId: input.jobId || null,
      customerId: input.customerId || null,
      uploadedById: input.uploadedById || null
    }
  });
  await prisma.storageUsageMonthly.upsert({
    where: { companyId_provider_year_month: { companyId: input.companyId, provider: input.provider || 'CLOUDFLARE_R2', ...parts } },
    update: { totalBytes: { increment: BigInt(input.sizeBytes || 0) }, objectCount: { increment: 1 } },
    create: { companyId: input.companyId, provider: input.provider || 'CLOUDFLARE_R2', ...parts, totalBytes: BigInt(input.sizeBytes || 0), objectCount: 1 }
  });
  return object;
}

module.exports = { recordStorageObject };
