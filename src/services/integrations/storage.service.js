const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { prisma } = require('../../db');
const { resolveActiveConnection } = require('./integrationConnections.service');
const { loadSecrets } = require('./integrationSecrets.service');
const { recordStorageObject } = require('./storageUsage.service');
const { fetchR2Object, uploadR2Object } = require('./providers/cloudflareR2Storage.provider');

const rootDir = path.resolve(__dirname, '../../..');

function cleanSegment(value, fallback = 'file') {
  return String(value || fallback).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function extensionFor(file) {
  return path.extname(file.originalname || '').toLowerCase() || '.bin';
}

function localUrlFor(localSubdir, filename) {
  return '/uploads/' + localSubdir.replace(/^\/+|\/+$/g, '') + '/' + filename;
}

async function saveLocal({ file, localSubdir, filename }) {
  const dir = path.join(rootDir, 'uploads', localSubdir);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, filename), file.buffer);
  return localUrlFor(localSubdir, filename);
}

function objectKeyFor({ companyId, scope, relatedId, filename }) {
  return ['companies', companyId, scope, relatedId, filename].filter(Boolean).map((part) => cleanSegment(part)).join('/');
}

function hasPublicR2Url(connection) {
  const config = connection.config || {};
  return Boolean(config.publicDomain || config.publicUrl || config.publicEndpoint);
}

async function storeUploadedFile({ companyId, file, scope, relatedId, localSubdir, filenamePrefix, uploadedById, bookingId, jobId, customerId, requirePublicUrl = false }) {
  const filename = cleanSegment(filenamePrefix || scope) + '-' + crypto.randomUUID() + extensionFor(file);
  const connection = await resolveActiveConnection(companyId, 'STORAGE', 'CLOUDFLARE_R2');
  if (!connection || (requirePublicUrl && !hasPublicR2Url(connection))) {
    const url = await saveLocal({ file, localSubdir, filename });
    return { storage: 'LOCAL', url, filename, originalName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size };
  }
  const objectKey = objectKeyFor({ companyId, scope, relatedId, filename });
  const secrets = await loadSecrets(companyId, connection.id);
  const uploaded = await uploadR2Object({ connection, secrets, objectKey, body: file.buffer, mimeType: file.mimetype });
  const storageObject = await recordStorageObject({
    companyId,
    integrationConnectionId: connection.id,
    provider: 'CLOUDFLARE_R2',
    bucket: uploaded.bucket,
    objectKey: uploaded.objectKey,
    safeUrl: uploaded.safeUrl,
    fileName: filename,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    checksum: uploaded.checksum,
    bookingId,
    jobId,
    customerId,
    uploadedById
  });
  return {
    storage: 'R2',
    url: uploaded.safeUrl || `/api/storage/objects/${storageObject.id}`,
    filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    storageObject
  };
}

async function getStorageObjectForCompany(companyId, id) {
  return prisma.storageObject.findFirst({ where: { id, companyId, deletedAt: null } });
}

async function readStorageObject(companyId, id) {
  const object = await getStorageObjectForCompany(companyId, id);
  if (!object) return null;
  const connection = object.integrationConnectionId ? await prisma.integrationConnection.findFirst({ where: { id: object.integrationConnectionId, companyId } }) : null;
  if (!connection) return null;
  const secrets = await loadSecrets(companyId, connection.id);
  const response = await fetchR2Object({ connection, secrets, objectKey: object.objectKey });
  const body = Buffer.from(await response.arrayBuffer());
  return { object, body, mimeType: object.mimeType || response.headers.get('content-type') || 'application/octet-stream' };
}

module.exports = { getStorageObjectForCompany, readStorageObject, storeUploadedFile };
