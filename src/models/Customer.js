const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    dateOfBirth: { type: String, required: true },
    identityType: { type: String, enum: ['bvn', 'nin'], default: null },
    identityNumber: { type: String, default: null },
    identityVerifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

function mask(number) {
  return number ? `${number.slice(0, 3)}*****${number.slice(-3)}` : null;
}

customerSchema.methods.publicView = function publicView() {
  return {
    id: this._id,
    email: this.email,
    firstName: this.firstName,
    lastName: this.lastName,
    phone: this.phone,
    dateOfBirth: this.dateOfBirth,
    onboarding: this.onboardingView(),
  };
};

customerSchema.methods.onboardingView = function onboardingView() {
  return {
    verified: Boolean(this.identityVerifiedAt),
    identityType: this.identityType,
    identityNumber: mask(this.identityNumber),
    verifiedAt: this.identityVerifiedAt,
  };
};

module.exports = mongoose.model('Customer', customerSchema);
