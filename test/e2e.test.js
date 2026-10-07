// End-to-end test: starts the mock NIBSS and the bank API, then walks through every requirement.
// It needs MongoDB running. It uses its own database and wipes it each run.
process.env.MONGO_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/digital_bank_test';
process.env.JWT_SECRET = 'test-secret-for-e2e';
process.env.BANK_CODE = '999';
process.env.NIBSS_BASE_URL = 'http://127.0.0.1:4102';
process.env.NIBSS_API_KEY = 'test-key';
process.env.NIBSS_API_SECRET = 'test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const { createMockNibss } = require('../mock/nibss-mock');

const BASE = 'http://127.0.0.1:4101';
let appServer;
let mockServer;

async function api(method, path, { token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

const person = (name) => ({
  email: `${name}@example.com`,
  password: 'Password123',
  firstName: name[0].toUpperCase() + name.slice(1),
  lastName: 'Tester',
  phone: '08012345678',
  dateOfBirth: '1995-04-23',
});

const alice = {};
const bob = {};
const refs = {};

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  if (!/test/i.test(mongoose.connection.name)) throw new Error('Refusing to wipe a database without "test" in its name');
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  mockServer = await new Promise((resolve) => {
    const server = createMockNibss().listen(4102, () => resolve(server));
  });
  appServer = await new Promise((resolve) => {
    const server = createApp().listen(4101, () => resolve(server));
  });
});

after(async () => {
  await new Promise((resolve) => appServer.close(resolve));
  await new Promise((resolve) => mockServer.close(resolve));
  await mongoose.disconnect();
});

test('rejects requests without a token', async () => {
  assert.equal((await api('GET', '/api/accounts/me')).status, 401);
  assert.equal((await api('GET', '/api/transactions')).status, 401);
});

test('registers two customers and logs one in', async () => {
  for (const [holder, name] of [[alice, 'alice'], [bob, 'bob']]) {
    const res = await api('POST', '/api/auth/register', { body: person(name) });
    assert.equal(res.status, 201);
    holder.token = res.body.token;
  }
  assert.equal((await api('POST', '/api/auth/register', { body: person('alice') })).status, 409);
  assert.equal((await api('POST', '/api/auth/login', { body: { email: 'alice@example.com', password: 'wrong' } })).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { body: { email: 'alice@example.com', password: 'Password123' } })).status, 200);
});

test('blocks account creation until BVN or NIN onboarding is done', async () => {
  const res = await api('POST', '/api/accounts', { token: alice.token });
  assert.equal(res.status, 403);
});

test('onboards one customer with a BVN and the other with a NIN', async () => {
  const a = await api('POST', '/api/onboarding/bvn', { token: alice.token });
  assert.equal(a.status, 201);
  assert.equal(a.body.onboarding.verified, true);
  assert.equal(a.body.onboarding.identityType, 'bvn');
  assert.match(a.body.onboarding.identityNumber, /\*\*\*\*\*/); // the full number is never returned

  const b = await api('POST', '/api/onboarding/nin', { token: bob.token });
  assert.equal(b.status, 201);
  assert.equal(b.body.onboarding.identityType, 'nin');

  assert.equal((await api('POST', '/api/onboarding/nin', { token: alice.token })).status, 409);
});

test('creates one pre-funded account per customer', async () => {
  for (const holder of [alice, bob]) {
    const res = await api('POST', '/api/accounts', { token: holder.token });
    assert.equal(res.status, 201);
    assert.equal(res.body.account.balance, 15000);
    assert.match(res.body.account.accountNumber, /^\d{10}$/);
    holder.accountNumber = res.body.account.accountNumber;
  }
  assert.equal((await api('POST', '/api/accounts', { token: alice.token })).status, 409);
});

test('checks the balance', async () => {
  const res = await api('GET', '/api/accounts/balance', { token: alice.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.balance, 15000);
});

test('name enquiry works inside the bank, across banks, and for unknown accounts', async () => {
  const intra = await api('GET', `/api/transfers/name-enquiry?accountNumber=${bob.accountNumber}`, { token: alice.token });
  assert.equal(intra.body.accountName, 'Bob Tester');

  const inter = await api('GET', '/api/transfers/name-enquiry?accountNumber=0123456789&bankCode=058', { token: alice.token });
  assert.equal(inter.body.accountName, 'Colleague Test');

  const unknown = await api('GET', '/api/transfers/name-enquiry?accountNumber=1111111111', { token: alice.token });
  assert.equal(unknown.status, 404);
});

test('intra-bank transfer moves the money', async () => {
  const res = await api('POST', '/api/transfers', {
    token: alice.token,
    body: { accountNumber: bob.accountNumber, amount: 5000, narration: 'Lunch' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.transaction.status, 'success');
  refs.intra = res.body.transaction.reference;

  assert.equal((await api('GET', '/api/accounts/balance', { token: alice.token })).body.balance, 10000);
  assert.equal((await api('GET', '/api/accounts/balance', { token: bob.token })).body.balance, 20000);
});

test('refuses bad transfers and leaves balances alone', async () => {
  const tooMuch = await api('POST', '/api/transfers', {
    token: alice.token,
    body: { accountNumber: bob.accountNumber, amount: 999999 },
  });
  assert.equal(tooMuch.status, 422);

  const toSelf = await api('POST', '/api/transfers', {
    token: alice.token,
    body: { accountNumber: alice.accountNumber, amount: 10 },
  });
  assert.equal(toSelf.status, 400);

  const badAmount = await api('POST', '/api/transfers', {
    token: alice.token,
    body: { accountNumber: bob.accountNumber, amount: -5 },
  });
  assert.equal(badAmount.status, 400);

  assert.equal((await api('GET', '/api/accounts/balance', { token: alice.token })).body.balance, 10000);
});

test('inter-bank transfer succeeds', async () => {
  const res = await api('POST', '/api/transfers', {
    token: alice.token,
    body: { accountNumber: '0123456789', bankCode: '058', amount: 2000 },
  });
  assert.equal(res.status, 201);
  refs.inter = res.body.transaction.reference;
  assert.equal((await api('GET', '/api/accounts/balance', { token: alice.token })).body.balance, 8000);
});

test('a declined inter-bank transfer is refunded', async () => {
  const res = await api('POST', '/api/transfers', {
    token: alice.token,
    body: { accountNumber: '9999999999', bankCode: '058', amount: 1000 },
  });
  assert.equal(res.status, 422);
  assert.equal((await api('GET', '/api/accounts/balance', { token: alice.token })).body.balance, 8000);
});

test('a pending inter-bank transfer settles when its status is checked', async () => {
  const res = await api('POST', '/api/transfers', {
    token: alice.token,
    body: { accountNumber: '5555555555', bankCode: '058', amount: 777 },
  });
  assert.equal(res.status, 202);
  assert.equal(res.body.transaction.status, 'pending');
  refs.pending = res.body.transaction.reference;

  const status = await api('GET', `/api/transactions/${refs.pending}`, { token: alice.token });
  assert.equal(status.body.transaction.status, 'success');
  assert.equal((await api('GET', '/api/accounts/balance', { token: alice.token })).body.balance, 7223);
});

test('transaction status check works for the sender and the recipient', async () => {
  const sender = await api('GET', `/api/transactions/${refs.intra}`, { token: alice.token });
  assert.equal(sender.body.transaction.direction, 'debit');
  assert.equal(sender.body.transaction.status, 'success');

  const recipient = await api('GET', `/api/transactions/${refs.intra}`, { token: bob.token });
  assert.equal(recipient.status, 200);
  assert.equal(recipient.body.transaction.direction, 'credit');
});

test('each customer sees only their own history', async () => {
  const aliceHistory = await api('GET', '/api/transactions', { token: alice.token });
  const aliceRefs = aliceHistory.body.items.map((tx) => tx.reference);
  for (const ref of [refs.intra, refs.inter, refs.pending]) assert.ok(aliceRefs.includes(ref));

  const bobHistory = await api('GET', '/api/transactions', { token: bob.token });
  assert.equal(bobHistory.body.items.length, 1);
  assert.equal(bobHistory.body.items[0].reference, refs.intra);
  assert.equal(bobHistory.body.items[0].direction, 'credit');
});

test('one customer cannot read another customer\'s transaction', async () => {
  const res = await api('GET', `/api/transactions/${refs.inter}`, { token: bob.token });
  assert.equal(res.status, 404);
  const missing = await api('GET', '/api/transactions/TXN-DOES-NOT-EXIST', { token: bob.token });
  assert.equal(missing.status, 404);
});

test('simultaneous transfers cannot overdraw the account', async () => {
  // Bob has 20000. Ten transfers of 3000 at once: only six can succeed.
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      api('POST', '/api/transfers', {
        token: bob.token,
        body: { accountNumber: alice.accountNumber, amount: 3000 },
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 6);
  assert.equal(results.filter((r) => r.status === 422).length, 4);
  assert.equal((await api('GET', '/api/accounts/balance', { token: bob.token })).body.balance, 2000);
});
