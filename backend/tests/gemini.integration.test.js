// Calls the REAL Gemini API. Skipped unless GEMINI_API_KEY (and GEMINI_MODEL) are configured.
const config = require('../src/config'); const { GeminiLLM } = require('../src/agent/geminiLLM'); const { createGeminiClient } = require('../src/config/gemini'); const { validateClassification } = require('../src/agent/validators');
const live = config.geminiApiKey && config.geminiModel && !/your_/.test(config.geminiApiKey) ? describe : describe.skip;
live('real Gemini API', () => {
  jest.setTimeout(60000); const llm = () => new GeminiLLM({ client: createGeminiClient(), model: config.geminiModel });
  test('classifies a VPN problem into the schema', async () => { expect(validateClassification(await llm().classify({ message: 'I cannot connect to the office VPN' })).category).toBe('VPN_CONNECTIVITY'); });
  test('chooses a declared function as the first action', async () => {
    const d = await llm().decideNext({ executionId: 'live-1', category: 'VPN_CONNECTIVITY', context: { userId: 'u1', deviceId: 'LAPTOP-001' }, docs: [{ title: 'VPN', content: 'Check internet first, then the VPN service.' }], observations: [], attempted: [] });
    expect(['tool', 'ask']).toContain(d.type); if (d.type === 'tool') expect(d.tool).toBe('checkInternetConnectivity');
  });
});
