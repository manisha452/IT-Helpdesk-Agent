// LLM service. MockLLM (explicit test mode), OllamaLLM (ollamaLLM.js, default) and GeminiLLM (geminiLLM.js) share: classify(), plan(), decideNext(). mode: 'mock' | 'llm' is surfaced on every execution.

const PLANS = {
  VPN_CONNECTIVITY: ['Understand the VPN issue', 'Retrieve VPN troubleshooting guide', 'Check internet connectivity', 'Check VPN service/connection', 'Apply permitted fix based on findings', 'Verify connection', 'Escalate if unresolved'],
  INTERNET_CONNECTIVITY: ['Understand the connectivity issue', 'Retrieve guide', 'Check internet connectivity', 'Run permitted diagnostic', 'Verify or escalate'],
  PASSWORD_RESET: ['Understand the request', 'Retrieve password reset procedure', 'Request administrator-approved reset (no passwords handled)', 'Await approval'],
  APPLICATION_ERROR: ['Understand the application issue', 'Retrieve guide', 'Check application health', 'Clear application cache if permitted', 'Verify health or escalate'],
  FILE_ACCESS: ['Understand the access issue', 'Retrieve shared folder procedure', 'Check permissions', 'Request administrator review if denied'],
  SLOW_SYSTEM: ['Understand the performance issue', 'Retrieve guide', 'Get device diagnostics', 'Clear temp files if needed', 'Verify or escalate'],
  EMAIL_ISSUE: ['Understand the email issue', 'Retrieve guide', 'Check email service', 'Verify or escalate'],
  UNKNOWN_ISSUE: ['Ask for more detail'],
};

class MockLLM {
  constructor() { this.mode = 'mock'; }
  async classify({ message }) {
    const m = message.toLowerCase();
    const category = /password|locked out|forgot/.test(m) ? 'PASSWORD_RESET' : /vpn/.test(m) ? 'VPN_CONNECTIVITY' : /email|outlook|mailbox/.test(m) ? 'EMAIL_ISSUE'
      : /shared|folder|file|permission/.test(m) ? 'FILE_ACCESS' : /slow|laggy|sluggish|performance/.test(m) ? 'SLOW_SYSTEM'
      : /crash|application|\bapp\b|freez|\bcrm\b|payroll/.test(m) ? 'APPLICATION_ERROR' : /internet|wifi|wi-fi|network/.test(m) ? 'INTERNET_CONNECTIVITY' : 'UNKNOWN_ISSUE';
    const app = (m.match(/\b(crm|payroll)\b/) || [])[1] || null;
    const res = (m.match(/\b(finance-share|hr-docs)\b/) || [])[1] || null;
    const missingInfo = [];
    if (category === 'APPLICATION_ERROR' && !app) missingInfo.push('applicationName');
    if (category === 'FILE_ACCESS' && !res) missingInfo.push('resourceId');
    return { category, description: message.slice(0, 200), affectedService: app || res || null, errorMessage: (message.match(/"([^"]+)"/) || [])[1] || null,
      applicationName: app, resourceId: res, missingInfo, escalationMayBeRequired: false };
  }
  async plan({ category }) { return PLANS[category] || PLANS.UNKNOWN_ISSUE; }
  async decideNext(s) { return mockDecide(s); }
}

function mockDecide(s) {
  const obs = s.observations, c = s.context;
  const idx = (t) => obs.map((o) => o.tool).lastIndexOf(t);
  const last = (t) => (idx(t) >= 0 ? obs[idx(t)] : null);
  const stale = (t) => s.verifyFailed && idx(t) < idx('verifyResolution');
  const tried = (f) => s.attempted.some((a) => a.startsWith(f + ':'));
  const tool = (name, args, reason) => ({ type: 'tool', tool: name, args, reason });
  const esc = (reason) => ({ type: 'escalate', reason });
  const lf = obs[obs.length - 1];
  if (lf && !lf.success && lf.tool !== 'searchKnowledgeBase') return esc(`${lf.tool} failed (${lf.error})`);
  if (lf && lf.success && lf.tool === 'applySafeFix') return { type: 'finish' };
  const needs = (t, args, reason) => (!last(t) || stale(t) ? tool(t, args, reason) : null);
  switch (s.category) {
    case 'VPN_CONNECTIVITY': {
      const net = last('checkInternetConnectivity');
      if (!net) return tool('checkInternetConnectivity', {}, 'VPN needs a working network');
      if (net.data.status !== 'AVAILABLE') return last('runPermittedDiagnostic') ? esc('Internet connectivity is down, so VPN troubleshooting was not attempted') : tool('runPermittedDiagnostic', { diagnosticType: 'PING_GATEWAY', deviceId: c.deviceId }, 'Investigate the underlying network problem');
      const n = needs('checkVPNStatus', {}, 'Inspect VPN state'); if (n) return n;
      const { service, connection } = last('checkVPNStatus').data;
      if (service !== 'RUNNING') return tried('RESTART_VPN_SERVICE') ? esc('VPN service did not recover after a permitted restart') : tool('applySafeFix', { fixType: 'RESTART_VPN_SERVICE', targetId: 'vpn_service' }, 'VPN service is stopped');
      if (connection !== 'CONNECTED') return tried('RECONNECT_VPN') ? esc('VPN still disconnected after reconnect attempt') : tool('applySafeFix', { fixType: 'RECONNECT_VPN', targetId: 'vpn_connection' }, 'Service running but disconnected');
      return { type: 'finish' };
    }
    case 'INTERNET_CONNECTIVITY': {
      const n = needs('checkInternetConnectivity', {}, 'Check connectivity'); if (n) return n;
      if (last('checkInternetConnectivity').data.status === 'AVAILABLE') return { type: 'finish' };
      return last('runPermittedDiagnostic') ? esc('Internet outage persists; no safe automated fix exists') : tool('runPermittedDiagnostic', { diagnosticType: 'PING_GATEWAY', deviceId: c.deviceId }, 'Confirm gateway reachability');
    }
    case 'EMAIL_ISSUE': {
      const n = needs('checkEmailServiceStatus', {}, 'Check mail service'); if (n) return n;
      return last('checkEmailServiceStatus').data.status === 'AVAILABLE' ? { type: 'finish' } : esc('Email service is unavailable; no safe client-side fix');
    }
    case 'APPLICATION_ERROR': {
      const n = needs('checkApplicationHealth', { applicationName: c.applicationName }, 'Check app health'); if (n) return n;
      if (last('checkApplicationHealth').data.status === 'HEALTHY') return { type: 'finish' };
      return tried('CLEAR_APP_CACHE') ? esc('Application remains unhealthy after cache clear') : tool('applySafeFix', { fixType: 'CLEAR_APP_CACHE', targetId: c.applicationName }, 'Documented safe fix');
    }
    case 'FILE_ACCESS': {
      const n = needs('checkFileAccess', { userId: c.userId, resourceId: c.resourceId }, 'Check permissions'); if (n) return n;
      return last('checkFileAccess').data.access === 'ALLOWED' ? { type: 'finish' } : tool('applySafeFix', { fixType: 'GRANT_FILE_ACCESS', targetId: c.resourceId }, 'Access denied; needs administrator review');
    }
    case 'PASSWORD_RESET': return tool('applySafeFix', { fixType: 'RESET_PASSWORD', targetId: c.userId }, 'Reset needs administrator approval');
    case 'SLOW_SYSTEM': {
      const n = needs('getDeviceDiagnostics', { deviceId: c.deviceId }, 'Inspect device'); if (n) return n;
      const d = last('getDeviceDiagnostics').data;
      if (d.diskUsagePct <= 90 && d.memoryPct <= 85) return { type: 'finish' };
      return !tried('CLEAR_TEMP_FILES') && d.tempFilesMb > 0 ? tool('applySafeFix', { fixType: 'CLEAR_TEMP_FILES', targetId: c.deviceId }, 'Free disk space') : esc('Device resources remain constrained after permitted actions');
    }
    default: return { type: 'ask', question: 'Could you tell me more about the problem? For example, which device, application or service is affected, and any error message you see?' };
  }
}

function createLLM(cfg) {
  if (cfg.llmProvider === 'mock') return new MockLLM();
  if (cfg.llmProvider === 'gemini') {
    const { GeminiLLM } = require('./geminiLLM'); const { createGeminiClient } = require('../config/gemini');
    return new GeminiLLM({ client: createGeminiClient(cfg.geminiApiKey), model: cfg.geminiModel });
  }
  const { OllamaLLM } = require('./ollamaLLM');
  return new OllamaLLM({ host: cfg.ollamaHost, model: cfg.ollamaModel, timeoutMs: cfg.ollamaTimeoutMs });
}
module.exports = { MockLLM, createLLM };
