require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

module.exports = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: required('MONGO_URI'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  bankName: process.env.BANK_NAME || 'Demo Bank',
  bankCode: process.env.BANK_CODE || '999',
  welcomeBonusKobo: 15000 * 100,
  nibss: {
    baseUrl: required('NIBSS_BASE_URL').replace(/\/$/, ''),
    apiKey: process.env.NIBSS_API_KEY || '',
    apiSecret: process.env.NIBSS_API_SECRET || '',
  },
};
