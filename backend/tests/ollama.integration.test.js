// Talks to a REAL local Ollama. Skipped unless RUN_OLLAMA_INTEGRATION=1 and OLLAMA_MODEL is set (model must be pulled and support tools).
const config = require('../src/config'); const { OllamaLLM } = require('../src/agent/ollamaLLM'); const { validateClassification } = require('../src/agent/validators');
const live = process.env.RUN_OLLAMA_INTEGRATION === '1' && config.ollamaModel ? describe : describe.skip;
live('real Ollama', () => {
  jest.setTimeout(240000); const llm = () => new OllamaLLM({ host: config.ollamaHost, model: config.ollamaModel, timeoutMs: config.ollamaTimeoutMs });
  test('server reachable and model installed', async () => { await llm().healthCheck(); });
  test('classifies a VPN problem into the schema', async () => { expect(validateClassification(await llm().classify({ message: 'I cannot connect to the office VPN' })).category).toBe('VPN_CONNECTIVITY'); });
  test('chooses a declared function as the first action', async () => {
    const d = await llm().decideNext({ executionId: 'live-1', category: 'VPN_CONNECTIVITY', context: { userId: 'u1', deviceId: 'LAPTOP-001' }, docs: [{ title: 'VPN', content: 'Check internet first, then the VPN service.' }], observations: [], attempted: [] });
    expect(['tool', 'ask']).toContain(d.type);
  });
});
