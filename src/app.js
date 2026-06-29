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

const app = express();
const rootDir = path.resolve(__dirname, '..');
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { message: 'Too many auth attempts. Try again later.' } }
});

app.use('/api/auth/register', authLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api', apiRouter);
app.use('/uploads', express.static(path.join(rootDir, 'uploads')));
app.use(express.static(rootDir, { extensions: ['html'] }));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: { message: 'API route not found' } });
  return res.status(404).send('Not found');
});

app.use(errorHandler);

module.exports = { app };
