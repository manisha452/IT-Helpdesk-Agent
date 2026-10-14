// The only place the Gemini SDK client is created. The API key stays on the backend; nothing here is sent to the browser.
const { GoogleGenAI } = require('@google/genai');
const config = require('./index');
function createGeminiClient(apiKey = config.geminiApiKey) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing. Create a free key at https://aistudio.google.com/apikey');
  return new GoogleGenAI({ apiKey });
}
module.exports = { createGeminiClient };
