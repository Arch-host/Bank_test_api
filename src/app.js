const express = require('express');
const { errorHandler, notFound } = require('./middleware/errors');

function createApp() {
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/onboarding', require('./routes/onboarding'));
  app.use('/api/accounts', require('./routes/accounts'));
  app.use('/api/transfers', require('./routes/transfers'));
  app.use('/api/transactions', require('./routes/transactions'));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
