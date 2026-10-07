// One-time step: tells NibssByPhoenix who you are. The credentials are emailed to you.
// Usage: npm run nibss:register -- you@example.com "Your Bank Name"
const nibss = require('../src/services/nibss');

const [email, companyName] = process.argv.slice(2);
if (!email || !companyName) {
  console.error('Usage: npm run nibss:register -- you@example.com "Your Bank Name"');
  process.exit(1);
}

nibss
  .registerBank({ email, companyName })
  .then((result) => console.log('Done. Check your email for the credentials.', result))
  .catch((error) => {
    console.error('Failed:', error.message);
    process.exit(1);
  });
