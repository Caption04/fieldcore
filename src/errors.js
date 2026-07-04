class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function sendData(res, data, status = 200, meta) {
  const body = { ok: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

function notFound(message = 'Resource not found') {
  return new AppError(404, message);
}

function redact(value) {
  if (value == null) return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.replace(/(password|token|secret|api[_-]?key|authorization|cookie)=?[^,\s"}]*/gi, '$1=[redacted]');
}

function errorHandler(error, req, res, next) {
  if (error && error.name === 'ZodError') {
    return res.status(400).json({ ok: false, error: { message: 'Validation failed', details: error.flatten() } });
  }

  if (error && error.code === 'P2002') {
    return res.status(409).json({ ok: false, error: { message: 'Record already exists' } });
  }

  if (error && error.code === 'P2025') {
    return res.status(404).json({ ok: false, error: { message: 'Resource not found' } });
  }

  const status = error.status || 500;
  const message = status === 500 ? 'Something went wrong.' : error.message;
  if (status === 500) {
    console.error('[server-error]', {
      method: req.method,
      path: req.path,
      message: redact(error && error.message || 'Unknown error')
    });
  }
  return res.status(status).json({ ok: false, error: { message, details: error.details } });
}

module.exports = { AppError, asyncHandler, errorHandler, notFound, redact, sendData };
