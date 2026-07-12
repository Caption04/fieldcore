require('dotenv').config();

const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { apiRouter } = require('./routes/api');
const { COOKIE_NAME } = require('./auth');
const { prisma } = require('./db');
const { errorHandler } = require('./errors');
const { assertValidEnv } = require('./config/env');
const { effectiveAccessForUser } = require('./services/accessControl.service');

const app = express();
const rootDir = path.resolve(__dirname, '..');
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
const DEV_JWT_SECRET = 'dev-only-change-me';
const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;
const CLIENT_COOKIE_NAME = process.env.CLIENT_COOKIE_NAME || 'fieldcore_client_token';
const CLIENT_JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;

assertValidEnv();
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https://www.paynow.co.zw", "https://pay.ozow.com", "https://*.tile.openstreetmap.org", "https://unpkg.com"],
        scriptSrc: ["'self'", "https://unpkg.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
        connectSrc: ["'self'", "https://*.tile.openstreetmap.org"],
      },
    },
  })
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

function limiter(options) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ ok: false, error: { message: options.message || 'Too many requests. Try again later.' } }),
    ...options
  });
}

const authLimiter = limiter({ windowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS || 15 * 60 * 1000), limit: Number(process.env.RATE_LIMIT_AUTH_MAX || 20), message: 'Too many auth attempts. Try again later.' });
const publicBookingLimiter = limiter({ windowMs: Number(process.env.RATE_LIMIT_PUBLIC_WINDOW_MS || 15 * 60 * 1000), limit: Number(process.env.RATE_LIMIT_PUBLIC_BOOKING_MAX || 30), message: 'Too many public requests. Try again later.' });
const trackingLimiter = limiter({ windowMs: Number(process.env.RATE_LIMIT_TRACKING_WINDOW_MS || 15 * 60 * 1000), limit: Number(process.env.RATE_LIMIT_TRACKING_MAX || 20), message: 'Too many tracking attempts. Try again later.' });
const uploadLimiter = limiter({ windowMs: Number(process.env.RATE_LIMIT_UPLOAD_WINDOW_MS || 15 * 60 * 1000), limit: Number(process.env.RATE_LIMIT_UPLOAD_MAX || 60), message: 'Too many uploads. Try again later.' });

const publicHtmlPages = new Set([
  'login.html',
  'register.html',
  'client-login.html',
  'client-register.html',
  'booking.html'
  ,'accept-invite.html'
]);

const staffHtmlPages = new Map([
  ['index.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['jobs.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['schedule.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['map.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['customers.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['members.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['booking-requests.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['quotes.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['invoices.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['reports.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['settings.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['branches.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['approvals.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['assets.html', ['OWNER', 'ADMIN']],
  ['service-contracts.html', ['OWNER', 'ADMIN']],
  ['contract-automation.html', ['OWNER', 'ADMIN']],
  ['inventory.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['purchase-requests.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['purchase-orders.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['procurement-costing.html', ['OWNER', 'ADMIN']],
  ['collections.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['mobile-sync.html', ['OWNER', 'ADMIN']],
  ['executive-dashboard.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['onboarding.html', ['OWNER', 'ADMIN']],
  ['security-center.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['no-access.html', ['OWNER', 'ADMIN', 'WORKER']],
  ['plan-selection.html', ['OWNER']],
  ['subscription.html', ['OWNER']]
]);

const staffPagePermissions = new Map([
  ['index.html', 'dashboard.operational.view'], ['jobs.html', 'jobs.view'], ['schedule.html', 'schedule.view'], ['map.html', 'workers.location.view'],
  ['customers.html', 'customers.view'], ['members.html', 'members.view'], ['booking-requests.html', 'bookings.view'], ['quotes.html', 'quotes.view'], ['invoices.html', 'invoices.view'],
  ['reports.html', 'finance.reports.view'], ['settings.html', 'company.settings.view'], ['branches.html', 'branch.view'], ['approvals.html', 'approval.request.decide'],
  ['assets.html', 'contract.automation.manage'], ['service-contracts.html', 'contract.automation.manage'], ['contract-automation.html', 'contract.automation.manage'],
  ['inventory.html', 'inventory.view'], ['purchase-requests.html', 'purchaseRequest.create'], ['purchase-orders.html', 'purchaseOrder.manage'], ['procurement-costing.html', 'inventory.manage'],
  ['collections.html', 'payments.view'], ['mobile-sync.html', 'mobile.sync.manage'], ['executive-dashboard.html', 'dashboard.executive.view'], ['onboarding.html', 'company.settings.manage'],
  ['security-center.html', 'security.view'], ['subscription.html', 'subscription.view']
]);

const staffPagePriority = [
  'index.html', 'jobs.html', 'schedule.html', 'customers.html', 'booking-requests.html', 'quotes.html', 'invoices.html', 'collections.html',
  'map.html', 'members.html', 'inventory.html', 'purchase-requests.html', 'purchase-orders.html', 'branches.html', 'approvals.html',
  'assets.html', 'service-contracts.html', 'contract-automation.html', 'procurement-costing.html', 'mobile-sync.html', 'reports.html',
  'executive-dashboard.html', 'settings.html', 'security-center.html', 'subscription.html'
];

function firstAllowedStaffPage(user, access) {
  const permissions = new Set(access && access.permissions || []);
  for (const page of staffPagePriority) {
    const roles = staffHtmlPages.get(page) || [];
    const permission = staffPagePermissions.get(page);
    if (roles.includes(user.role) && (!permission || permissions.has(permission))) return `/${page}`;
  }
  return '/no-access.html';
}

const clientHtmlPages = new Set(['client-portal.html']);

function requestedHtmlPage(req) {
  if (!['GET', 'HEAD'].includes(req.method)) return null;
  if (req.path === '/') return 'index.html';

  const page = req.path.replace(/^\/+/, '');
  if (!page || page.includes('/')) return null;
  if (page.endsWith('.html')) return page;
  if (!path.extname(page)) return `${page}.html`;
  return null;
}

async function staffPageUser(req) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, companyId: true, roleTemplateId: true, defaultScopeType: true, company: { select: { onboardingState: true } } }
    });
  } catch (error) {
    return null;
  }
}

async function clientPageAccount(req) {
  const token = req.cookies[CLIENT_COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, CLIENT_JWT_SECRET);
    if (payload.kind !== 'client') return null;
    return prisma.clientAccount.findFirst({
      where: { id: payload.sub, companyId: payload.companyId, status: { not: 'DISABLED' } },
      select: { id: true, companyId: true }
    });
  } catch (error) {
    return null;
  }
}

async function htmlPageAccessGuard(req, res, next) {
  const page = requestedHtmlPage(req);
  if (!page || publicHtmlPages.has(page)) return next();

  if (clientHtmlPages.has(page)) {
    if (await clientPageAccount(req)) return next();
    if (await staffPageUser(req)) return res.redirect(302, '/index.html');
    return res.redirect(302, '/client-login.html');
  }

  const allowedRoles = staffHtmlPages.get(page);
  if (!allowedRoles) return next();

  if (req.cookies[CLIENT_COOKIE_NAME] && await clientPageAccount(req)) return res.redirect(302, '/client-portal.html');

  const user = await staffPageUser(req);
  if (!user) return res.redirect(302, '/login.html');
  if (user.company && user.company.onboardingState !== 'COMPLETED' && page !== 'plan-selection.html') return res.redirect(302, '/plan-selection.html');
  if (page === 'plan-selection.html' && user.company && user.company.onboardingState === 'COMPLETED') return res.redirect(302, '/index.html');

  const access = await effectiveAccessForUser(user, { companyId: user.companyId });
  const fallback = firstAllowedStaffPage(user, access);
  if (page === 'no-access.html') {
    if (fallback !== '/no-access.html') return res.redirect(302, fallback);
    return next();
  }
  if (!allowedRoles.includes(user.role)) return res.redirect(302, fallback);
  const requiredPermission = staffPagePermissions.get(page);
  if (requiredPermission && !access.permissions.includes(requiredPermission)) return res.redirect(302, fallback);

  return next();
}

app.get('/healthz', (req, res) => res.json({ ok: true, status: 'alive' }));
app.get('/readyz', async (req, res) => {
  try {
    if (typeof prisma.$queryRaw === 'function') await prisma.$queryRaw`SELECT 1`;
    return res.json({ ok: true, status: 'ready' });
  } catch (error) {
    return res.status(503).json({ ok: false, status: 'not_ready' });
  }
});

app.use('/api/auth/register', authLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/2fa/enable', authLimiter);
app.use('/api/auth/2fa/recovery-codes', authLimiter);
app.use('/api/client/auth/login', authLimiter);
app.use('/api/client/auth/register', authLimiter);
app.use('/api/client/auth/forgot-password', authLimiter);
app.use('/api/public/booking-requests/track', trackingLimiter);
app.use('/api/public/booking-requests', publicBookingLimiter);
app.use('/api/jobs', (req, res, next) => {
  if (req.method === 'POST' && /\/(proof-photos|signature|completion-location)$/.test(req.path)) return uploadLimiter(req, res, next);
  return next();
});
app.use('/api', apiRouter);
app.use('/uploads', express.static(path.join(rootDir, 'uploads')));
app.use(htmlPageAccessGuard);
app.use(express.static(rootDir, { extensions: ['html'] }));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: { message: 'API route not found' } });
  return res.status(404).send('Not found');
});

app.use(errorHandler);

module.exports = { app };
