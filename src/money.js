// Money is stored as whole kobo so additions and subtractions never drift.
const toKobo = (naira) => Math.round(naira * 100);
const toNaira = (kobo) => kobo / 100;

// A valid amount is a positive number with at most 2 decimal places.
function isValidAmount(value) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
  );
}

module.exports = { toKobo, toNaira, isValidAmount };
