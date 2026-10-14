const mongoose = require('mongoose'); const cfg = require('./config'); const { createMongoStore } = require('./store'); const { createApp } = require('./app'); const { createLLM } = require('./agent/llm');
(async () => {
  try { cfg.validate(); } catch (e) { console.error(e.message); process.exit(1); }
  await mongoose.connect(cfg.mongoUri);
  const llm = createLLM(cfg);
  if (llm.healthCheck) { try { await llm.healthCheck(); } catch (e) { console.error(e.message); process.exit(1); } }
  console.log(llm.mode === 'mock' ? '*** MOCK MODE (LLM_MODE=mock): rule-based agent, NO LLM in use ***' : `LLM: ${llm.provider} (${llm.model})`);
  createApp({ store: createMongoStore(), llm }).listen(cfg.port, () => console.log(`API on :${cfg.port}`));
})().catch((e) => { console.error(e.message); process.exit(1); });
