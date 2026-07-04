require('dotenv').config();

const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { apiRouter } = require('./routes/api');
const { errorHandler } = require('./errors');
const { assertValidEnv } = require('./config/env');

const app = express();
const rootDir = path.resolve(__dirname, '..');
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

assertValidEnv();
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https://www.paynow.co.zw"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
      },
    },
  })
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
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

app.get('/healthz', (req, res) => res.json({ ok: true, status: 'alive' }));
app.get('/readyz', async (req, res) => {
  try {
    const { prisma } = require('./db');
    if (typeof prisma.$queryRaw === 'function') await prisma.$queryRaw`SELECT 1`;
    return res.json({ ok: true, status: 'ready' });
  } catch (error) {
    return res.status(503).json({ ok: false, status: 'not_ready' });
  }
});

app.use('/api/auth/register', authLimiter);
app.use('/api/auth/login', authLimiter);
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
app.use(express.static(rootDir, { extensions: ['html'] }));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: { message: 'API route not found' } });
  return res.status(404).send('Not found');
});

app.use(errorHandler);

module.exports = { app };
