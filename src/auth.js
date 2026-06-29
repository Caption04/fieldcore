const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('./db');
const { AppError } = require('./errors');

const COOKIE_NAME = process.env.COOKIE_NAME || 'fieldcore_token';
const DEV_JWT_SECRET = 'dev-only-change-me';
const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || JWT_SECRET === DEV_JWT_SECRET)) {
  throw new Error('JWT_SECRET must be set to a strong non-default value in production');
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 1000 * 60 * 60 * 8
};

const SAFE_USER_SELECT = {
  id: true,
  companyId: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true
};

const SAFE_AUTH_USER_SELECT = {
  ...SAFE_USER_SELECT,
  company: { select: { id: true, name: true } },
  worker: { select: { id: true, title: true, phone: true, active: true } }
};

const SAFE_LOGIN_USER_SELECT = {
  ...SAFE_AUTH_USER_SELECT,
  passwordHash: true
};

const SAFE_WORKER_INCLUDE = {
  user: { select: SAFE_USER_SELECT }
};

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    companyId: user.companyId,
    email: user.email,
    name: user.name,
    role: user.role,
    company: user.company ? { id: user.company.id, name: user.company.name } : undefined,
    worker: user.worker ? { id: user.worker.id, title: user.worker.title, phone: user.worker.phone, active: user.worker.active } : undefined
  };
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function signToken(user) {
  return jwt.sign({ sub: user.id, companyId: user.companyId, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
}

function setAuthCookie(res, user) {
  res.cookie(COOKIE_NAME, signToken(user), COOKIE_OPTIONS);
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { sameSite: COOKIE_OPTIONS.sameSite, secure: COOKIE_OPTIONS.secure });
}

async function requireAuth(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    const token = req.cookies[COOKIE_NAME] || bearer;
    if (!token) throw new AppError(401, 'Authentication required');

    const payload = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: SAFE_AUTH_USER_SELECT
    });
    if (!user) throw new AppError(401, 'Authentication required');
    req.user = user;
    req.companyId = user.companyId;
    next();
  } catch (error) {
    next(error.status ? error : new AppError(401, 'Authentication required'));
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) return next(new AppError(403, 'Insufficient permissions'));
    return next();
  };
}

async function audit(req, action, entity, entityId, metadata) {
  const companyId = req.companyId || (req.user && req.user.companyId);
  if (!companyId) return;
  await prisma.auditLog.create({
    data: {
      companyId,
      userId: req.user && req.user.id,
      action,
      entity,
      entityId,
      metadata
    }
  });
}

module.exports = {
  COOKIE_NAME,
  SAFE_AUTH_USER_SELECT,
  SAFE_LOGIN_USER_SELECT,
  SAFE_USER_SELECT,
  SAFE_WORKER_INCLUDE,
  clearAuthCookie,
  hashPassword,
  publicUser,
  requireAuth,
  requireRole,
  setAuthCookie,
  verifyPassword,
  audit
};
