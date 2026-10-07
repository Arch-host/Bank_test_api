const config = require('../config');
const { toNaira } = require('../money');

function accountView(account) {
  return {
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    bankName: config.bankName,
    bankCode: config.bankCode,
    balance: toNaira(account.balanceKobo),
    currency: 'NGN',
    createdAt: account.createdAt,
  };
}

// A transaction as seen by one of its two sides. The other side only ever appears
// as a name and an account number, which is what a bank statement shows.
function transactionView(tx, myAccountNumber) {
  const debit = tx.fromAccount === myAccountNumber;
  return {
    reference: tx.reference,
    type: tx.type,
    direction: debit ? 'debit' : 'credit',
    amount: toNaira(tx.amountKobo),
    status: tx.status,
    narration: tx.narration,
    failureReason: debit ? tx.failureReason : undefined,
    counterparty: debit
      ? { accountNumber: tx.toAccount, accountName: tx.toName, bankCode: tx.toBankCode }
      : { accountNumber: tx.fromAccount, accountName: tx.fromName, bankCode: config.bankCode },
    createdAt: tx.createdAt,
  };
}

// The only way to read transactions: money out of my account, or money that arrived in it.
function visibleTo(accountNumber) {
  return {
    $or: [
      { fromAccount: accountNumber },
      { toAccount: accountNumber, toBankCode: config.bankCode, status: 'success' },
    ],
  };
}

module.exports = { accountView, transactionView, visibleTo };
