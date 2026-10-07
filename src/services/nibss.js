// Everything that talks to NibssByPhoenix lives in this file.
// If the real API differs from the mock, change ENDPOINTS and the small adapter
// functions at the bottom. Nothing else in the project needs to change.
const config = require('../config');

const ENDPOINTS = {
  onboardBank: { method: 'POST', path: '/api/auth/onboard' },
  token: { method: 'POST', path: '/api/auth/token' },
  createBvn: { method: 'POST', path: '/api/onboarding/bvn' },
  createNin: { method: 'POST', path: '/api/onboarding/nin' },
  createAccount: { method: 'POST', path: '/api/account/create' },
  nameEnquiry: { method: 'POST', path: '/api/account/name-enquiry' },
  transfer: { method: 'POST', path: '/api/transfer' },
  transactionStatus: { method: 'GET', path: '/api/transaction/:reference' },
};

class NibssError extends Error {
  constructor(message, statusCode, details) {
    super(message);
    this.name = 'NibssError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

let cachedToken = null;

async function call(endpoint, { body, params = {}, token } = {}) {
  const path = endpoint.path.replace(/:(\w+)/g, (_, key) => encodeURIComponent(params[key]));

  let response;
  try {
    response = await fetch(`${config.nibss.baseUrl}${path}`, {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new NibssError(`Could not reach NIBSS (${error.name})`, 503);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new NibssError(payload.message || `NIBSS returned ${response.status}`, response.status, payload);
  }
  return payload.data ?? payload;
}

async function getToken(force = false) {
  if (!force && cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  const data = await call(ENDPOINTS.token, {
    body: { apiKey: config.nibss.apiKey, apiSecret: config.nibss.apiSecret },
  });
  const seconds = Number(data.expiresIn) || 3600;
  cachedToken = { token: data.token, expiresAt: Date.now() + (seconds - 30) * 1000 };
  return cachedToken.token;
}

// Adds the token, and retries once with a fresh token if NIBSS says it expired.
async function authed(endpoint, options = {}) {
  try {
    return await call(endpoint, { ...options, token: await getToken() });
  } catch (error) {
    if (error instanceof NibssError && error.statusCode === 401) {
      return call(endpoint, { ...options, token: await getToken(true) });
    }
    throw error;
  }
}

function normaliseStatus(value) {
  const status = String(value || '').toLowerCase();
  if (['success', 'successful', 'completed'].includes(status)) return 'success';
  if (['failed', 'declined', 'rejected'].includes(status)) return 'failed';
  return 'pending';
}

// ---- Adapter: our shapes in, our shapes out -------------------------------

async function registerBank({ email, companyName }) {
  return call(ENDPOINTS.onboardBank, { body: { email, companyName } });
}

async function createBvn(person) {
  const data = await authed(ENDPOINTS.createBvn, { body: person });
  return { number: data.bvn };
}

async function createNin(person) {
  const data = await authed(ENDPOINTS.createNin, { body: person });
  return { number: data.nin };
}

async function createAccount(details) {
  const data = await authed(ENDPOINTS.createAccount, { body: details });
  return { accountNumber: data.accountNumber, accountName: data.accountName };
}

async function nameEnquiry({ accountNumber, bankCode }) {
  const data = await authed(ENDPOINTS.nameEnquiry, { body: { accountNumber, bankCode } });
  return { accountNumber, bankCode, accountName: data.accountName };
}

async function transfer({ reference, fromAccount, fromName, toAccount, toBankCode, amountKobo, narration }) {
  const data = await authed(ENDPOINTS.transfer, {
    body: { reference, fromAccount, fromName, toAccount, toBankCode, amount: amountKobo / 100, narration },
  });
  return { status: normaliseStatus(data.status), message: data.message };
}

async function transactionStatus(reference) {
  const data = await authed(ENDPOINTS.transactionStatus, { params: { reference } });
  return { status: normaliseStatus(data.status), message: data.message };
}

module.exports = {
  NibssError,
  registerBank,
  createBvn,
  createNin,
  createAccount,
  nameEnquiry,
  transfer,
  transactionStatus,
};
