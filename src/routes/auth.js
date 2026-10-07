const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const express = require('express');
const config = require('../config');
const Customer = require('../models/Customer');
const { HttpError } = require('../middleware/errors');

const router = express.Router();

const signToken = (customer) =>
  jwt.sign({ sub: customer._id.toString() }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

router.post('/register', async (req, res) => {
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const phone = String(body.phone || '').trim();
  const dateOfBirth = String(body.dateOfBirth || '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (!firstName || !lastName) throw new HttpError(400, 'firstName and lastName are required');
  if (!/^\+?\d{10,15}$/.test(phone)) throw new HttpError(400, 'Enter a valid phone number');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(Date.parse(dateOfBirth))) {
    throw new HttpError(400, 'dateOfBirth must look like 1995-04-23');
  }

  if (await Customer.exists({ email })) {
    throw new HttpError(409, 'An account with this email already exists');
  }

  const customer = await Customer.create({
    email,
    passwordHash: await bcrypt.hash(password, 10),
    firstName,
    lastName,
    phone,
    dateOfBirth,
  });
  res.status(201).json({ token: signToken(customer), customer: customer.publicView() });
});

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  const customer = await Customer.findOne({ email }).select('+passwordHash');
  const ok = customer && (await bcrypt.compare(password, customer.passwordHash));
  if (!ok) throw new HttpError(401, 'Incorrect email or password');

  res.json({ token: signToken(customer), customer: customer.publicView() });
});

module.exports = router;
