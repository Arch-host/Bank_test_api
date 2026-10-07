const express = require('express');
const config = require('../config');
const Account = require('../models/Account');
const nibss = require('../services/nibss');
const { accountView } = require('../services/views');
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../middleware/errors');

const router = express.Router();
router.use(requireAuth);

async function myAccount(customer) {
  const account = await Account.findOne({ customer: customer._id });
  if (!account) throw new HttpError(404, 'You do not have an account yet');
  return account;
}

router.post('/', async (req, res) => {
  const customer = req.customer;

  if (!customer.identityVerifiedAt) {
    throw new HttpError(403, 'Complete BVN or NIN onboarding before opening an account');
  }
  if (await Account.exists({ customer: customer._id })) {
    throw new HttpError(409, 'You already have an account. Each customer can have only one');
  }

  const created = await nibss.createAccount({
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phoneNumber: customer.phone,
    dateOfBirth: customer.dateOfBirth,
    [customer.identityType]: customer.identityNumber,
  });
  if (!created.accountNumber) throw new HttpError(502, 'NIBSS did not return an account number');

  try {
    const account = await Account.create({
      customer: customer._id,
      accountNumber: created.accountNumber,
      accountName: created.accountName || `${customer.firstName} ${customer.lastName}`,
      balanceKobo: config.welcomeBonusKobo,
    });
    res.status(201).json({ message: 'Account created and funded with NGN 15,000', account: accountView(account) });
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'You already have an account');
    throw error;
  }
});

router.get('/me', async (req, res) => {
  res.json({ account: accountView(await myAccount(req.customer)) });
});

router.get('/balance', async (req, res) => {
  const account = await myAccount(req.customer);
  res.json({ accountNumber: account.accountNumber, balance: accountView(account).balance, currency: 'NGN' });
});

module.exports = router;
