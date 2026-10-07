const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    type: { type: String, enum: ['intra', 'inter'], required: true },
    fromAccount: { type: String, required: true, index: true },
    fromName: { type: String, required: true },
    toAccount: { type: String, required: true, index: true },
    toName: { type: String, required: true },
    toBankCode: { type: String, required: true },
    amountKobo: { type: Number, required: true, min: 1 },
    narration: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
    failureReason: { type: String, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Transaction', transactionSchema);
