class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function notFound(req, res) {
  res.status(404).json({ message: 'Route not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });

  if (err.name === 'NibssError') {
    console.error('NIBSS error:', err.statusCode, err.message);
    return res.status(502).json({
      message: 'The interbank service could not complete the request. Please try again.',
      detail: err.message,
    });
  }

  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body' });
  if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
  if (err.code === 11000) return res.status(409).json({ message: 'That value is already in use' });

  console.error(err);
  return res.status(500).json({ message: 'Something went wrong on our side' });
}

module.exports = { HttpError, notFound, errorHandler };
