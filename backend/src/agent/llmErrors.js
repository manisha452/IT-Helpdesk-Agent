class LlmError extends Error {
  constructor(code, message, { retryable = false, cause } = {}) { super(message); this.name = 'LlmError'; this.code = code; this.retryable = retryable; this.cause = cause; }
}
// Map SDK/network errors to typed errors. Only transient ones are retryable (the caller caps retries at 2).
function classifyError(e) {
  if (e instanceof LlmError) return e;
  const status = typeof e?.status === 'number' ? e.status : typeof e?.code === 'number' ? e.code : null; const msg = String(e?.message || e);
  const mk = (code, retryable, m) => new LlmError(code, m || msg.slice(0, 300), { retryable, cause: e });
  if (/API key not valid|API_KEY_INVALID|API key expired|API key.*invalid/i.test(msg) || status === 401 || status === 403) return mk('INVALID_API_KEY', false, 'Gemini rejected the API key. Check GEMINI_API_KEY.');
  if (status === 404 || /models\/.* is not found|not found for API version|is not supported for generateContent/i.test(msg)) return mk('MODEL_NOT_FOUND', false, 'Gemini model not found or unsupported. Check GEMINI_MODEL.');
  if (status === 429 || /RESOURCE_EXHAUSTED/.test(msg)) return /per day|daily|quota exceeded for metric/i.test(msg) && !/per minute/i.test(msg) ? mk('QUOTA_EXHAUSTED', false, 'Gemini quota exhausted.') : mk('RATE_LIMIT', true, 'Gemini rate limit reached.');
  if ((status && status >= 500) || /UNAVAILABLE|INTERNAL|DEADLINE_EXCEEDED|overloaded/i.test(msg)) return mk('SERVICE_UNAVAILABLE', true, 'Gemini service unavailable.');
  if (/fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|network/i.test(msg)) return mk('NETWORK_ERROR', true, 'Network error contacting Gemini.');
  if (status === 400) return mk('INVALID_REQUEST', false);
  return mk('UNKNOWN', false);
}
// const withTimeout = (p, ms) => new Promise((resolve, reject) => {
//   const t = setTimeout(() => reject(new LlmError('TIMEOUT', `Gemini request timed out after ${ms}ms`, { retryable: true })), ms);
//   p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
// });

const withTimeout = (p, ms) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new LlmError(
          'TIMEOUT',
          `LLM request timed out after ${ms}ms`,
          { retryable: true }
        )
      );
    }, ms);

    Promise.resolve(p).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
module.exports = { LlmError, classifyError, withTimeout };
