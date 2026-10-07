const mongoose = require('mongoose');
const config = require('./config');
const { createApp } = require('./app');

async function start() {
  await mongoose.connect(config.mongoUri);
  console.log(`Connected to database: ${mongoose.connection.name}`);
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  createApp().listen(config.port, () => {
    console.log(`${config.bankName} API running at http://localhost:${config.port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start:', error.message);
  process.exit(1);
});
