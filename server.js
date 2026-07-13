const { app } = require('./src/app');
const { prisma } = require('./src/db');
const { processPaymentNotificationOutbox } = require('./src/services/payments/paymentNotificationOutbox.service');
const { reconcileDuePaymentLinks } = require('./src/services/payments/paymentReconciliation.service');

const PORT = Number(process.env.PORT || 3000);

const server = app.listen(PORT, () => {
  console.log(`FieldCore server running at http://localhost:${PORT}`);
});

let paymentJobsRunning = false;
const paymentJobIntervalMs = Math.max(60_000, Number(process.env.PAYMENT_RECONCILIATION_INTERVAL_MS || 60_000));
async function runPaymentJobs() {
  if (paymentJobsRunning || process.env.DISABLE_PAYMENT_BACKGROUND_JOBS === 'true') return;
  paymentJobsRunning = true;
  try {
    await reconcileDuePaymentLinks(prisma, { limit: Number(process.env.PAYMENT_RECONCILIATION_BATCH_SIZE || 20) });
    await processPaymentNotificationOutbox(prisma, { limit: Number(process.env.PAYMENT_NOTIFICATION_BATCH_SIZE || 25) });
  } catch (error) {
    console.error('[payment-jobs]', String(error && error.message || error).replace(/[\r\n\t]+/g, ' ').slice(0, 240));
  } finally {
    paymentJobsRunning = false;
  }
}
const paymentJobTimer = setInterval(runPaymentJobs, paymentJobIntervalMs);
paymentJobTimer.unref();
setTimeout(runPaymentJobs, 5_000).unref();

async function shutdown() {
  clearInterval(paymentJobTimer);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
