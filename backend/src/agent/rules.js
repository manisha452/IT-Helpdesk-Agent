// Deterministic business rules. The LLM never decides urgency, security status, or authorization.
const SECURITY = /phish|breach|hack|malware|ransomware|compromis|stolen|suspicious (login|email)|virus/i;
const HUMAN = /\b(human|real person|it admin|administrator|technician|speak to (someone|a person)|talk to (someone|a person))\b/i;
const FOLLOWUP = /(tried (that|it|this)|still (not|doesn|does not|no|can)|didn'?t work|did not work|same (problem|issue)|not working still)/i;
const INJECTION = /(ignore|disregard|forget).{0,30}(previous|prior|above|all).{0,20}(instruction|rule)|system prompt|you are now|developer mode|override (policy|approval)/i;
const LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const BASE = { INTERNET_CONNECTIVITY: 'HIGH', VPN_CONNECTIVITY: 'MEDIUM', PASSWORD_RESET: 'MEDIUM', APPLICATION_ERROR: 'MEDIUM', FILE_ACCESS: 'MEDIUM', EMAIL_ISSUE: 'MEDIUM', SLOW_SYSTEM: 'LOW', UNKNOWN_ISSUE: 'LOW' };
function urgency(category, text) {
  if (SECURITY.test(text)) return 'CRITICAL';
  let i = LEVELS.indexOf(BASE[category] || 'LOW');
  if (/urgent|asap|deadline|client meeting|production|cannot work|locked out|everyone|whole team/i.test(text)) i = Math.min(i + 1, 3);
  return LEVELS[i];
}
module.exports = { urgency, SECURITY, HUMAN, FOLLOWUP, INJECTION, LEVELS };
