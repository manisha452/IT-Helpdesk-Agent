require('dotenv').config();
const env = process.env;
const config = {
  port: Number(env.PORT) || 5000,
  mongoUri: env.MONGO_URI || env.MONGODB_URI,
  jwtSecret: env.JWT_SECRET || 'dev-only-change-me',
  // LLM_PROVIDER: ollama (default, local, no key) | gemini. LLM_MODE=mock is an explicit, labelled test mode (rule-based, no LLM).
  llmProvider: env.LLM_MODE === 'mock' ? 'mock' : (env.LLM_PROVIDER || 'ollama').toLowerCase(),
  ollamaHost: env.OLLAMA_HOST || 'http://127.0.0.1:11434',
  ollamaModel: env.OLLAMA_MODEL,
  ollamaTimeoutMs: Number(env.OLLAMA_TIMEOUT_MS) || 180000,
  geminiApiKey: env.GEMINI_API_KEY,
  geminiModel: env.GEMINI_MODEL,
  devControls: env.NODE_ENV !== 'production' && env.ENABLE_DEV_CONTROLS !== 'false',
  limits: { maxTools: 8, maxRetries: 2, maxIterations: 20 },
};
// Call at startup. Throws one readable error listing everything that is missing.
config.validate = (c = config) => {
  const errs = [];
  if (!c.mongoUri) errs.push('MONGO_URI is required (your MongoDB connection string).');
  if (!['ollama', 'gemini', 'mock'].includes(c.llmProvider)) errs.push(`LLM_PROVIDER must be ollama or gemini (got "${c.llmProvider}").`);
  if (c.llmProvider === 'ollama' && !c.ollamaModel) errs.push('OLLAMA_MODEL is required, for example OLLAMA_MODEL=llama3.1:8b (run `ollama pull llama3.1:8b` first; the model must support tool calling).');
  if (c.llmProvider === 'gemini') {
    if (!c.geminiApiKey || /your_gemini_api_key_here/.test(c.geminiApiKey)) errs.push('GEMINI_API_KEY is missing. Create a free key at https://aistudio.google.com/apikey and put it in backend/.env.');
    if (!c.geminiModel || /your_supported/.test(c.geminiModel)) errs.push('GEMINI_MODEL is required, for example GEMINI_MODEL=gemini-2.5-flash (pick a current Flash model that supports function calling).');
  }
  if (env.NODE_ENV === 'production' && c.jwtSecret === 'dev-only-change-me') errs.push('JWT_SECRET must be set in production.');
  if (errs.length) throw new Error('Configuration error:\n - ' + errs.join('\n - '));
};
module.exports = config;
