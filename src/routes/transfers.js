const express = require('express');
const config = require('../config');
const { createTransfer, resolveRecipient } = require('../services/transfers');
const { transactionView } = require('../services/views');
const Account = require('../models/Account');
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../middleware/errors');

const router = express.Router();
router.use(requireAuth);

router.get('/name-enquiry', async (req, res) => {
  const accountNumber = String(req.query.accountNumber || '');
  const bankCode = String(req.query.bankCode || config.bankCode);
  const { accountName } = await resolveRecipient(accountNumber, bankCode);
  res.json({ accountNumber, accountName, bankCode });
});

router.post('/', async (req, res) => {
  const tx = await createTransfer(req.customer, req.body || {});
  const sender = await Account.findOne({ customer: req.customer._id });
  const body = { transaction: transactionView(tx, sender.accountNumber) };

  if (tx.status === 'failed') throw new HttpError(422, tx.failureReason || 'Transfer failed');
  if (tx.status === 'pending') {
    return res.status(202).json({
      message: 'Transfer is being processed. Check its status with the reference.',
      ...body,
    });
  }
  res.status(201).json({ message: 'Transfer successful', ...body });
});

module.exports = router;
