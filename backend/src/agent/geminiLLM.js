// Gemini-backed LLM service with the same interface as MockLLM: classify(), plan(), decideNext().
// decideNext uses native Gemini function calling: the model returns a functionCall, the backend validates and executes it,
// and the real result goes back to Gemini as a functionResponse before the next decision.
const { LlmError, classifyError, withTimeout } = require('./llmErrors');
const { FUNCTION_DECLARATIONS, FUNCTION_NAMES, SAFETY, DECIDE_RULES, callToDecision } = require('./toolDeclarations');
const { CATS } = require('./validators');

const S = (description, extra = {}) => ({ type: 'STRING', description, ...extra });
const O = (properties, required) => ({ type: 'OBJECT', properties, required });
const partsOf = (r) => r?.candidates?.[0]?.content?.parts || [];
const textOf = (r) => partsOf(r).filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
const toResponse = (o) => (o.success ? { output: o.data } : { error: o.error });

class GeminiLLM {
  constructor({ client, model, timeoutMs = 30000, maxRetries = 2, backoffMs = 500, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
    this.mode = 'llm'; this.provider = 'gemini'; this.client = client; this.model = model; this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries; this.backoffMs = backoffMs; this.sleep = sleep; this.sessions = new Map();
  }
  // Transient failures (rate limit, 5xx, network, timeout) are retried at most twice; auth/model/quota errors are not retried.
  async _generate(req) {
    for (let attempt = 0; ; attempt++) {
      try { return await withTimeout(this.client.models.generateContent({ model: this.model, ...req }), this.timeoutMs); }
      catch (e) { const err = classifyError(e); if (!err.retryable || attempt >= this.maxRetries) throw err; await this.sleep(this.backoffMs * 2 ** attempt); }
    }
  }
  async _json(system, contents, schema) {
    const r = await this._generate({ contents, config: { systemInstruction: system, temperature: 0, responseMimeType: 'application/json', responseSchema: schema } });
    const text = textOf(r).replace(/```json|```/g, '').trim();
    try { return JSON.parse(text); } catch { throw new LlmError('MALFORMED_RESPONSE', 'Gemini returned invalid JSON'); }
  }
  classify({ message, prior }) {
    const schema = O({ category: S('Issue category', { enum: CATS }), description: S('One-sentence problem description'), affectedService: S('Affected service or device', { nullable: true }),
      errorMessage: S('Error message quoted by the employee', { nullable: true }), applicationName: S('crm or payroll if mentioned', { nullable: true }),
      resourceId: S('finance-share or hr-docs if mentioned', { nullable: true }), missingInfo: { type: 'ARRAY', items: { type: 'STRING' } }, escalationMayBeRequired: { type: 'BOOLEAN' } }, ['category', 'description', 'missingInfo']);
    return this._json(`${SAFETY}\nClassify the employee's IT problem into the schema. List missing information instead of guessing. If it matches nothing, use UNKNOWN_ISSUE.`,
      [{ role: 'user', parts: [{ text: `<untrusted_user_message>${message}</untrusted_user_message>\nPrior context: ${JSON.stringify(prior || null)}` }] }], schema);
  }
  async plan({ category, classification, docs }) {
    const o = await this._json(`${SAFETY}\nWrite a short plan (max 8 steps) grounded ONLY in the retrieved procedures. The plan may change as results arrive.`,
      [{ role: 'user', parts: [{ text: JSON.stringify({ category, classification, docs: docs.map((d) => ({ title: d.title, content: d.content })) }) }] }], O({ plan: { type: 'ARRAY', items: { type: 'STRING' } } }, ['plan']));
    return o.plan;
  }
  _initial(state) {
    const docs = state.docs.map((d) => `<untrusted_document title="${d.title}">\n${d.content}\n</untrusted_document>`).join('\n');
    return `Issue category: ${state.category}\nContext: ${JSON.stringify({ ...state.context, executionId: state.executionId })}\nRetrieved procedures:\n${docs || '(none)'}\nAttempted fixes so far: ${JSON.stringify(state.attempted)}\nChoose the first action.`;
  }
  async decideNext(state) {
    const id = state.executionId; let sess = this.sessions.get(id);
    if (!sess) { sess = { contents: [{ role: 'user', parts: [{ text: this._initial(state) }] }], seen: state.observations.length, pending: null }; this.sessions.set(id, sess); }
    else if (sess.pending) { // send the REAL result of the previous function call back to Gemini
      const fresh = state.observations.slice(sess.seen); sess.seen = state.observations.length;
      sess.contents.push({ role: 'user', parts: [{ functionResponse: { name: sess.pending.name, response: fresh.length ? toResponse(fresh[0]) : { error: 'NO_RESULT' } } }] });
      sess.pending = null;
    }
    const r = await this._generate({ contents: sess.contents, config: { systemInstruction: DECIDE_RULES, temperature: 0, tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
      toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: FUNCTION_NAMES } } } });
    const parts = partsOf(r); const i = parts.findIndex((p) => p.functionCall && typeof p.functionCall.name === 'string');
    if (i < 0) throw new LlmError('MALFORMED_RESPONSE', 'Gemini returned no function call');
    const call = parts[i].functionCall; const args = call.args && typeof call.args === 'object' ? call.args : {};
    // Keep history valid: replay only up to the first function call (we execute one action per turn); this preserves thought signatures.
    sess.contents.push({ role: 'model', parts: parts.slice(0, i + 1) }); sess.pending = { name: call.name, args };
    return callToDecision(call.name, args);
  }
  endSession(id) { this.sessions.delete(id); }
}
module.exports = { GeminiLLM, FUNCTION_DECLARATIONS };
