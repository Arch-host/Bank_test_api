// A local stand-in for NibssByPhoenix, with the same shape the adapter in
// src/services/nibss.js expects. Run it with: npm run mock
//
// Special accounts at bank 058 for testing transfers:
//   0123456789  "Colleague Test"   -> transfer succeeds
//   9999999999  "Declined Account" -> transfer is declined (your money is refunded)
//   5555555555  "Slow Account"     -> transfer stays pending until its status is checked
const express = require('express');

const API_KEY = 'test-key';
const API_SECRET = 'test-secret';
const TOKEN = 'mock-token';
const OUR_BANK_CODE = '999';

function createMockNibss() {
  const app = express();
  app.use(express.json());

  const accounts = new Map([
    ['058:0123456789', { name: 'Colleague Test' }],
    ['058:9999999999', { name: 'Declined Account' }],
    ['058:5555555555', { name: 'Slow Account' }],
  ]);
  const transfers = new Map();
  const randomDigits = (length) =>
    Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');

  const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
  const fail = (res, status, message) => res.status(status).json({ success: false, message });

  app.post('/api/auth/onboard', (req, res) => {
    if (!req.body.email || !req.body.companyName) return fail(res, 400, 'email and companyName are required');
    return ok(res, { message: 'Credentials sent to your email' });
  });

  app.post('/api/auth/token', (req, res) => {
    if (req.body.apiKey !== API_KEY || req.body.apiSecret !== API_SECRET) return fail(res, 401, 'Invalid credentials');
    return ok(res, { token: TOKEN, expiresIn: 3600 });
  });

  // Everything below needs the token.
  app.use((req, res, next) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return fail(res, 401, 'Missing or invalid token');
    return next();
  });

  function identity(kind) {
    return (req, res) => {
      const { firstName, lastName, dateOfBirth, phoneNumber } = req.body;
      if (!firstName || !lastName || !dateOfBirth || !phoneNumber) {
        return fail(res, 400, 'firstName, lastName, dateOfBirth and phoneNumber are required');
      }
      return ok(res, { [kind]: `${kind === 'bvn' ? '2' : '9'}${randomDigits(10)}` }, 201);
    };
  }
  app.post('/api/onboarding/bvn', identity('bvn'));
  app.post('/api/onboarding/nin', identity('nin'));

  app.post('/api/account/create', (req, res) => {
    const { firstName, lastName, bvn, nin } = req.body;
    if (!firstName || !lastName) return fail(res, 400, 'firstName and lastName are required');
    if (!bvn && !nin) return fail(res, 400, 'A BVN or NIN is required to open an account');

    const accountNumber = `30${randomDigits(8)}`;
    accounts.set(`${OUR_BANK_CODE}:${accountNumber}`, { name: `${firstName} ${lastName}` });
    return ok(res, { accountNumber, accountName: `${firstName} ${lastName}`, balance: 15000 }, 201);
  });

  app.post('/api/account/name-enquiry', (req, res) => {
    const found = accounts.get(`${req.body.bankCode}:${req.body.accountNumber}`);
    if (!found) return fail(res, 404, 'Account not found');
    return ok(res, { accountName: found.name });
  });

  app.post('/api/transfer', (req, res) => {
    const { reference, toAccount, toBankCode, amount } = req.body;
    if (!reference || !toAccount || !toBankCode || !(amount > 0)) {
      return fail(res, 400, 'reference, toAccount, toBankCode and amount are required');
    }
    if (transfers.has(reference)) return fail(res, 409, 'Duplicate reference');
    if (!accounts.has(`${toBankCode}:${toAccount}`)) return fail(res, 404, 'Destination account not found');

    let status = 'success';
    if (toAccount === '9999999999') status = 'failed';
    if (toAccount === '5555555555') status = 'pending';

    transfers.set(reference, { status });
    return ok(res, {
      reference,
      status,
      message: status === 'failed' ? 'Declined by the destination bank' : 'OK',
    });
  });

  app.get('/api/transaction/:reference', (req, res) => {
    const found = transfers.get(req.params.reference);
    if (!found) return fail(res, 404, 'Transaction not found');
    if (found.status === 'pending') found.status = 'success'; // a slow transfer completes when checked
    return ok(res, { reference: req.params.reference, status: found.status });
  });

  return app;
}

module.exports = { createMockNibss };

if (require.main === module) {
  const port = Number(process.env.MOCK_PORT) || 4001;
  createMockNibss().listen(port, () => console.log(`Mock NIBSS running at http://localhost:${port}`));
}
