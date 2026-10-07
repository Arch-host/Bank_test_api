const jwt = require('jsonwebtoken');
const config = require('../config');
const Customer = require('../models/Customer');
const { HttpError } = require('./errors');

async function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }

  const customer = await Customer.findById(payload.sub);
  if (!customer) throw new HttpError(401, 'Invalid or expired token');

  // Every route reads the customer from the token, never from the request body or URL.
  req.customer = customer;
  next();
}

module.exports = { requireAuth };
