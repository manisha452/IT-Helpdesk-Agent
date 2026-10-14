// Ollama-backed LLM service (local models, no API key). Same interface as GeminiLLM/MockLLM: classify(), plan(), decideNext().
// Uses Ollama's /api/chat with native tool calling and JSON-schema structured output.
const { LlmError, withTimeout } = require('./llmErrors');
const { CATS } = require('./validators');
const { FUNCTION_DECLARATIONS, FUNCTION_NAMES, SAFETY, DECIDE_RULES, callToDecision, toJsonSchema } = require('./toolDeclarations');

const TOOLS = FUNCTION_DECLARATIONS.map((f) => ({ type: 'function', function: { name: f.name, description: f.description, parameters: f.parameters ? toJsonSchema(f.parameters) : { type: 'object', properties: {} } } }));
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const safeParse = (t) => { try { return JSON.parse(String(t).replace(/```json|```/g, '').trim()); } catch { return null; } };
const NUDGE = 'Respond by calling exactly one of the provided functions. Do not answer in plain text.';

// Local models sometimes print the call as JSON text instead of using tool_calls; accept that only for declared function names.
function extractCall(msg) {
  const tc = msg?.tool_calls?.[0]?.function;
  if (tc && typeof tc.name === 'string') { const a = typeof tc.arguments === 'string' ? safeParse(tc.arguments) : tc.arguments; return { name: tc.name, args: a && typeof a === 'object' ? a : {} }; }
  const j = typeof msg?.content === 'string' ? safeParse(msg.content) : null;
  if (j && typeof j.name === 'string' && FUNCTION_NAMES.includes(j.name)) { const a = j.arguments || j.parameters; return { name: j.name, args: a && typeof a === 'object' ? a : {} }; }
  return null;
}

class OllamaLLM {
  constructor({ host = 'http://127.0.0.1:11434', model, timeoutMs = 300000, maxRetries = 2, backoffMs = 500, numCtx = 8192, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
    this.mode = 'llm'; this.provider = 'ollama'; this.host = host.replace(/\/+$/, ''); this.model = model; this.timeoutMs = timeoutMs; this.maxRetries = maxRetries;
    this.backoffMs = backoffMs; this.numCtx = numCtx; this.fetch = fetchImpl; this.sleep = sleep; this.sessions = new Map();
  }
  _httpError(status, body) {
    const msg = (safeParse(body)?.error || String(body || '')).slice(0, 300);
    if (status === 404 || /model .*not found/i.test(msg)) return new LlmError('MODEL_NOT_FOUND', `Ollama model "${this.model}" not found. Run: ollama pull ${this.model}`);
    if (/does not support tools/i.test(msg)) return new LlmError('MODEL_NO_TOOLS', `Model "${this.model}" does not support tool calling. Use a tool-capable model (see ollama.com/search?c=tools).`);
    if (status === 401 || status === 403) return new LlmError('UNAUTHORIZED', 'Ollama endpoint rejected the request (check OLLAMA_HOST / proxy credentials).');
    if (status === 429 || status >= 500) return new LlmError('SERVICE_UNAVAILABLE', `Ollama error ${status}: ${msg}`, { retryable: true });
    return new LlmError('INVALID_REQUEST', `Ollama rejected the request (${status}): ${msg}`);
  }
  async _request(path, { method = 'GET', body } = {}) {
    for (let attempt = 0; ; attempt++) {
      try {
        let res;
        try { res = await withTimeout(this.fetch(`${this.host}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), this.timeoutMs); }
        catch (e) { if (e instanceof LlmError) throw e; throw new LlmError('OLLAMA_UNREACHABLE', `Cannot reach Ollama at ${this.host}. Is it installed and running?`, { retryable: true, cause: e }); }
        if (!res.ok) throw this._httpError(res.status, await res.text());
        return await res.json();
      } catch (e) { if (!(e instanceof LlmError) || !e.retryable || attempt >= this.maxRetries) throw e; await this.sleep(this.backoffMs * 2 ** attempt); }
    }
  }
  _chat(extra) { return this._request('/api/chat', { method: 'POST', body: { model: this.model, stream: false, options: { temperature: 0, num_ctx: this.numCtx }, ...extra } }); }
  async _json(system, user, schema) {
    const data = await this._chat({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], format: schema });
    const o = safeParse(data?.message?.content); if (!o || typeof o !== 'object') throw new LlmError('MALFORMED_RESPONSE', 'Ollama returned invalid JSON'); return o;
  }
  // Startup check: server reachable and model pulled.
  async healthCheck() {
    let data; try { data = await this._request('/api/tags'); } catch (e) { throw new Error(e.message); }
    const names = (data.models || []).map((m) => m.name || m.model);
    const ok = names.some((n) => n === this.model || n === `${this.model}:latest` || (!this.model.includes(':') && n.startsWith(`${this.model}:`)));
    if (!ok) throw new Error(`Ollama model "${this.model}" is not installed. Run: ollama pull ${this.model}  (installed: ${names.join(', ') || 'none'})`);
  }
  classify({ message, prior }) {
    const schema = { type: 'object', properties: { category: { type: 'string', enum: CATS }, description: str('One-sentence problem description'), affectedService: { type: ['string', 'null'] }, errorMessage: { type: ['string', 'null'] },
      applicationName: { type: ['string', 'null'] }, resourceId: { type: ['string', 'null'] }, missingInfo: { type: 'array', items: { type: 'string' } }, escalationMayBeRequired: { type: 'boolean' } }, required: ['category', 'description', 'missingInfo'] };
    return this._json(`${SAFETY}\nClassify the employee's IT problem as JSON matching the schema. applicationName is crm or payroll if mentioned; resourceId is finance-share or hr-docs if mentioned. List missing information instead of guessing. If nothing matches use UNKNOWN_ISSUE.`,
      `<untrusted_user_message>${message}</untrusted_user_message>\nPrior context: ${JSON.stringify(prior || null)}`, schema);
  }
  async plan({ category, classification, docs }) {
    const o = await this._json(`${SAFETY}\nWrite a short plan (max 8 steps) grounded ONLY in the retrieved procedures, as JSON {"plan": [..]}. The plan may change as results arrive.`,
      JSON.stringify({ category, classification, docs: docs.map((d) => ({ title: d.title, content: d.content })) }), { type: 'object', properties: { plan: { type: 'array', items: { type: 'string' } } }, required: ['plan'] });
    return o.plan;
  }
  _initial(state) {
    const docs = state.docs.map((d) => `<untrusted_document title="${d.title}">\n${d.content}\n</untrusted_document>`).join('\n');
    return `Issue category: ${state.category}\nContext: ${JSON.stringify({ ...state.context, executionId: state.executionId })}\nRetrieved procedures:\n${docs || '(none)'}\nAttempted fixes so far: ${JSON.stringify(state.attempted)}\nChoose the first action.`;
  }
  async decideNext(state) {
    const id = state.executionId; let s = this.sessions.get(id);
    if (!s) { s = { messages: [{ role: 'system', content: DECIDE_RULES }, { role: 'user', content: this._initial(state) }], seen: state.observations.length, pending: null }; this.sessions.set(id, s); }
    else if (s.pending) { // return the REAL result of the previous call to the model
      const fresh = state.observations.slice(s.seen); s.seen = state.observations.length;
      s.messages.push({ role: 'tool', tool_name: s.pending.name, content: JSON.stringify(fresh.length ? (fresh[0].success ? { output: fresh[0].data } : { error: fresh[0].error }) : { error: 'NO_RESULT' }) }); s.pending = null;
    }
    let call = null;
    for (let nudge = 0; nudge < 2 && !call; nudge++) {
      const data = await this._chat({ messages: s.messages, tools: TOOLS }); const msg = data?.message;
      call = extractCall(msg);
      if (!call) s.messages.push({ role: 'assistant', content: typeof msg?.content === 'string' ? msg.content : '' }, { role: 'user', content: NUDGE });
    }
    if (!call) throw new LlmError('MALFORMED_RESPONSE', 'Ollama model did not call a function');
    s.messages.push({ role: 'assistant', content: '', tool_calls: [{ function: { name: call.name, arguments: call.args } }] }); s.pending = call; // one action per turn
    return callToDecision(call.name, call.args);
  }
  endSession(id) { this.sessions.delete(id); }
}
module.exports = { OllamaLLM, TOOLS };
