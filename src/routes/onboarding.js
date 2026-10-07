const express = require('express');
const Account = require('../models/Account');
const Customer = require('../models/Customer');
const nibss = require('../services/nibss');
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../middleware/errors');

const router = express.Router();
router.use(requireAuth);

router.get('/status', async (req, res) => {
  const hasAccount = Boolean(await Account.exists({ customer: req.customer._id }));
  res.json({ ...req.customer.onboardingView(), hasAccount });
});

// The customer never sends a BVN or NIN. NIBSS creates one for them, so no real number is ever handled.
async function onboard(kind, req, res) {
  const customer = req.customer;
  if (customer.identityVerifiedAt) {
    throw new HttpError(409, `Onboarding is already complete with your ${customer.identityType.toUpperCase()}`);
  }

  const person = {
    firstName: customer.firstName,
    lastName: customer.lastName,
    dateOfBirth: customer.dateOfBirth,
    phoneNumber: customer.phone,
    email: customer.email,
  };
  const result = kind === 'bvn' ? await nibss.createBvn(person) : await nibss.createNin(person);
  if (!result.number) throw new HttpError(502, `NIBSS did not return a ${kind.toUpperCase()}`);

  // Only saves if nobody finished onboarding while we were waiting for NIBSS.
  const updated = await Customer.findOneAndUpdate(
    { _id: customer._id, identityVerifiedAt: null },
    { identityType: kind, identityNumber: result.number, identityVerifiedAt: new Date() },
    { new: true },
  );
  if (!updated) throw new HttpError(409, 'Onboarding is already complete');

  res.status(201).json({
    message: `${kind.toUpperCase()} created and verified. You can now open an account.`,
    onboarding: updated.onboardingView(),
  });
}

router.post('/bvn', (req, res) => onboard('bvn', req, res));
router.post('/nin', (req, res) => onboard('nin', req, res));

module.exports = router;
