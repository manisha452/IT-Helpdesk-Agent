const mongoose = require('mongoose'); const cfg = require('./config'); const { createMongoStore } = require('./store'); const { seed } = require('./seed');
(async () => { await mongoose.connect(cfg.mongoUri); await mongoose.connection.dropDatabase(); await seed(createMongoStore()); console.log('Seeded. Users: alice@corp.test, bob@corp.test, admin@corp.test / Passw0rd!'); process.exit(0); })();
