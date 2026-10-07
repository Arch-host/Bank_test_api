const express = require('express');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const { refreshIfPending } = require('../services/transfers');
const { transactionView, visibleTo } = require('../services/views');
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../middleware/errors');

const router = express.Router();
router.use(requireAuth);

async function myAccountNumber(customer) {
  const account = await Account.findOne({ customer: customer._id });
  if (!account) throw new HttpError(404, 'You do not have an account yet');
  return account.accountNumber;
}

router.get('/', async (req, res) => {
  const mine = await myAccountNumber(req.customer);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = visibleTo(mine);

  const [items, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Transaction.countDocuments(filter),
  ]);

  res.json({
    items: items.map((tx) => transactionView(tx, mine)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

router.get('/:reference', async (req, res) => {
  const mine = await myAccountNumber(req.customer);

  // Someone else's reference gets the same 404 as one that doesn't exist.
  let tx = await Transaction.findOne({ reference: req.params.reference, ...visibleTo(mine) });
  if (!tx) throw new HttpError(404, 'Transaction not found');

  if (tx.fromAccount === mine) tx = await refreshIfPending(tx);
  res.json({ transaction: transactionView(tx, mine) });
});

module.exports = router;
