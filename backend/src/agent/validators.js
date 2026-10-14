const CATS = ['VPN_CONNECTIVITY', 'INTERNET_CONNECTIVITY', 'PASSWORD_RESET', 'APPLICATION_ERROR', 'FILE_ACCESS', 'SLOW_SYSTEM', 'EMAIL_ISSUE', 'UNKNOWN_ISSUE'];
const s = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : null);
function validateClassification(o) {
  if (!o || typeof o !== 'object' || !CATS.includes(o.category)) throw new Error('invalid classification');
  return { category: o.category, description: s(o.description) || '', affectedService: s(o.affectedService), errorMessage: s(o.errorMessage),
    applicationName: s(o.applicationName)?.toLowerCase() || null, resourceId: s(o.resourceId),
    missingInfo: Array.isArray(o.missingInfo) ? o.missingInfo.map(String).slice(0, 5) : [], escalationMayBeRequired: !!o.escalationMayBeRequired };
}
function validateDecision(o, hasTool) {
  if (!o || typeof o !== 'object') throw new Error('invalid decision');
  if (o.type === 'tool') { if (typeof o.tool !== 'string') throw new Error('invalid decision'); return { type: 'tool', tool: o.tool, args: o.args && typeof o.args === 'object' ? o.args : {}, reason: s(o.reason) }; }
  if (o.type === 'ask') { if (!s(o.question)) throw new Error('invalid decision'); return { type: 'ask', question: s(o.question) }; }
  if (o.type === 'escalate') return { type: 'escalate', reason: s(o.reason) || 'Escalated by agent' };
  if (o.type === 'finish') return { type: 'finish' };
  throw new Error('invalid decision');
}
const validatePlan = (p) => { if (!Array.isArray(p) || !p.length) throw new Error('invalid plan'); return p.slice(0, 10).map((x) => String(x).slice(0, 160)); };
module.exports = { validateClassification, validateDecision, validatePlan, CATS };
