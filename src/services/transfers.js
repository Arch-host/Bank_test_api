const crypto = require('node:crypto');
const config = require('../config');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const nibss = require('./nibss');
const { HttpError } = require('../middleware/errors');
const { toKobo, isValidAmount } = require('../money');

// Finds who owns an account, in our bank or another bank, before any money moves.
async function resolveRecipient(accountNumber, bankCode) {
  if (!/^\d{10}$/.test(accountNumber)) throw new HttpError(400, 'accountNumber must be 10 digits');
  if (!/^\d{3,6}$/.test(bankCode)) throw new HttpError(400, 'bankCode must be 3 to 6 digits');

  if (bankCode === config.bankCode) {
    const account = await Account.findOne({ accountNumber });
    if (!account) throw new HttpError(404, 'Account not found');
    return { accountNumber, bankCode, accountName: account.accountName, intra: true };
  }

  try {
    const found = await nibss.nameEnquiry({ accountNumber, bankCode });
    return { ...found, intra: false };
  } catch (error) {
    if (error instanceof nibss.NibssError && error.statusCode === 404) {
      throw new HttpError(404, 'Account not found');
    }
    throw error;
  }
}

// Moves a transaction out of "pending" exactly once, so a refund can never happen twice.
async function settle(id, status, failureReason = null) {
  const settled = await Transaction.findOneAndUpdate(
    { _id: id, status: 'pending' },
    { status, failureReason },
    { new: true },
  );
  return settled || Transaction.findById(id);
}

async function failAndRefund(tx, reason) {
  const moved = await Transaction.findOneAndUpdate(
    { _id: tx._id, status: 'pending' },
    { status: 'failed', failureReason: reason },
    { new: true },
  );
  if (moved) await Account.updateOne({ accountNumber: tx.fromAccount }, { $inc: { balanceKobo: tx.amountKobo } });
  return moved || Transaction.findById(tx._id);
}

async function createTransfer(customer, input) {
  const sender = await Account.findOne({ customer: customer._id });
  if (!sender) throw new HttpError(409, 'Create an account before making a transfer');

  if (!isValidAmount(input.amount)) {
    throw new HttpError(400, 'amount must be a positive number with at most 2 decimal places');
  }
  const narration = String(input.narration || '').slice(0, 100);
  const bankCode = input.bankCode ? String(input.bankCode) : config.bankCode;
  const accountNumber = String(input.accountNumber || '');

  const recipient = await resolveRecipient(accountNumber, bankCode);
  if (recipient.intra && accountNumber === sender.accountNumber) {
    throw new HttpError(400, 'You cannot transfer to your own account');
  }

  const amountKobo = toKobo(input.amount);
  const tx = await Transaction.create({
    reference: `TXN-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    type: recipient.intra ? 'intra' : 'inter',
    fromAccount: sender.accountNumber,
    fromName: sender.accountName,
    toAccount: accountNumber,
    toName: recipient.accountName,
    toBankCode: bankCode,
    amountKobo,
    narration,
  });

  // One conditional update: it only debits if the balance is enough, so it can't go negative
  // even when two transfers arrive at the same moment.
  const debited = await Account.findOneAndUpdate(
    { _id: sender._id, balanceKobo: { $gte: amountKobo } },
    { $inc: { balanceKobo: -amountKobo } },
  );
  if (!debited) {
    await settle(tx._id, 'failed', 'Insufficient funds');
    throw new HttpError(422, 'Insufficient funds');
  }

  if (recipient.intra) {
    try {
      await Account.updateOne({ accountNumber }, { $inc: { balanceKobo: amountKobo } });
      return settle(tx._id, 'success');
    } catch (error) {
      await failAndRefund(tx, 'Could not credit the recipient');
      throw error;
    }
  }

  try {
    const result = await nibss.transfer({
      reference: tx.reference,
      fromAccount: tx.fromAccount,
      fromName: tx.fromName,
      toAccount: tx.toAccount,
      toBankCode: tx.toBankCode,
      amountKobo,
      narration,
    });
    if (result.status === 'success') return settle(tx._id, 'success');
    if (result.status === 'failed') return failAndRefund(tx, result.message || 'Declined by the destination bank');
    return tx; // still pending: check it later with the status endpoint
  } catch (error) {
    // A clear rejection means no money moved, so refund. A timeout or server error is
    // unclear, so the transfer stays pending until the status check settles it.
    const rejected =
      error instanceof nibss.NibssError &&
      error.statusCode >= 400 &&
      error.statusCode < 500 &&
      ![408, 429].includes(error.statusCode);
    if (rejected) return failAndRefund(tx, error.message);
    return tx;
  }
}

// Asks NIBSS about an inter-bank transfer that is still pending and settles it.
async function refreshIfPending(tx) {
  if (tx.status !== 'pending' || tx.type !== 'inter') return tx;

  try {
    const result = await nibss.transactionStatus(tx.reference);
    if (result.status === 'success') return settle(tx._id, 'success');
    if (result.status === 'failed') return failAndRefund(tx, result.message || 'Declined by the destination bank');
  } catch (error) {
    if (error instanceof nibss.NibssError && error.statusCode === 404) {
      return failAndRefund(tx, 'The transfer was never received by NIBSS');
    }
  }
  return tx;
}

module.exports = { resolveRecipient, createTransfer, refreshIfPending };
