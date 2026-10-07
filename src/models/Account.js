const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
  {
    // unique: a customer can have at most one account, enforced by the database.
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, unique: true },
    accountNumber: { type: String, required: true, unique: true },
    accountName: { type: String, required: true },
    balanceKobo: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Account', accountSchema);
