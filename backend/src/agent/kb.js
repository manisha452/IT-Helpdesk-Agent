// RAG: lightweight local hashed bag-of-words embeddings + cosine search (pluggable: swap embed() for a real embedding API).
const DIM = 512;
const STOP = new Set('i me my a an the to of in on at is are was be it this that and or for with can cannot cant not how do does did you your from have has had when what why please been get got am im'.split(' '));
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h) % DIM; };
function embed(text) {
  const v = new Array(DIM).fill(0);
  for (const w of String(text).toLowerCase().match(/[a-z0-9]+/g) || []) { if (STOP.has(w) || w.length < 2) continue; v[hash(stem(w))] += 1; }
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / n);
}
const cosine = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
// Retrieved documents are untrusted: strip instruction-like lines before they reach the LLM.
const INJECTION = /(ignore|disregard|forget).{0,30}(previous|prior|above|all).{0,20}(instruction|rule|prompt)|system prompt|you are now|reveal .*(secret|key|password)/i;
const sanitize = (text) => text.split('\n').filter((l) => !INJECTION.test(l)).join('\n');

function createKb(store, { minScore = 0.1 } = {}) {
  return {
    embed,
    async addDocument(doc) {
      const embedding = embed(`${doc.title} ${doc.category} ${doc.content}`);
      return store.insert('knowledge', { ...doc, metadata: { ...(doc.metadata || {}), embedding } });
    },
    async search(query, k = 3) {
      const q = embed(query);
      const docs = await store.find('knowledge');
      return docs.map((d) => ({ d, score: cosine(q, d.metadata.embedding) })).filter((x) => x.score >= minScore)
        .sort((a, b) => b.score - a.score).slice(0, k)
        .map(({ d, score }) => ({ id: d.id, title: d.title, category: d.category, score: +score.toFixed(3), content: sanitize(d.content) }));
    },
  };
}
const DOCS = [
  ['VPN Connection Troubleshooting', 'VPN_CONNECTIVITY', 'Symptoms: cannot connect to office VPN, VPN disconnected, VPN timeout, VPN client error.\nDiagnostic steps: 1) confirm internet connectivity first; if the internet is down, fix that before VPN. 2) check VPN service status and VPN connection status.\nSafe actions: restart the VPN service; reconnect the VPN.\nEscalate if: VPN stays disconnected after restart and reconnect, or internet outage persists.'],
  ['Internet Connectivity Troubleshooting', 'INTERNET_CONNECTIVITY', 'Symptoms: no internet, laptop cannot connect to network, wifi connected without internet, DNS errors.\nDiagnostic steps: check internet connectivity, ping gateway, DNS lookup.\nSafe actions: recheck connectivity (transient failures may retry).\nEscalate if: outage persists. Network infrastructure changes need an IT administrator.'],
  ['Password Reset Procedure', 'PASSWORD_RESET', 'Symptoms: forgot password, locked out of account, password expired.\nProcedure: the agent never sees, sets or shares passwords. Request an administrator-approved reset; a reset link is sent to the registered email.\nEscalate if: the user suspects the account is compromised.'],
  ['Application Crash Troubleshooting', 'APPLICATION_ERROR', 'Symptoms: application crashing, application error, app freezes, app unhealthy.\nDiagnostic steps: check application health.\nSafe actions: clear the application temporary cache, then recheck health.\nEscalate if: application remains unhealthy after cache clear (possible corrupt install).'],
  ['Shared Folder Access Procedure', 'FILE_ACCESS', 'Symptoms: cannot access shared folder, shared company file permission denied, access denied to file share.\nDiagnostic steps: check file access permissions for the employee.\nPolicy: access is never granted by the agent; an IT administrator must review and approve the request.\nEscalate if: access is denied.'],
  ['Email Configuration Troubleshooting', 'EMAIL_ISSUE', 'Symptoms: cannot send or receive email, Outlook not syncing, mail server error.\nDiagnostic steps: check email service status; verify client settings.\nSafe actions: none that modify the mail server.\nEscalate if: the email service is unavailable.'],
  ['Slow Computer Troubleshooting', 'SLOW_SYSTEM', 'Symptoms: slow computer, system running very slowly, laptop lag, high memory, disk full.\nDiagnostic steps: get device diagnostics (disk usage, memory utilization), run disk check.\nSafe actions: clear temporary files.\nEscalate if: memory remains high or disk usage stays above 90 percent.'],
  ['IT Escalation Policy', 'POLICY', 'Escalate to a human IT administrator when: the agent cannot resolve the problem after permitted attempts, a diagnostic tool repeatedly fails, privileged access is needed, a security-sensitive problem is reported (phishing, breach, malware), no safe procedure exists, or the user requests a human. Privileged actions always need administrator approval.'],
];
module.exports = { createKb, embed, DOCS, sanitize };
