// Allowlisted tool registry + simulated IT environment. Every tool returns {success,data,error,retryable}.
const audit = require('../audit');
const { createTicket } = require('../tickets');
const ok = (data) => ({ success: true, data, error: null, retryable: false });
const fail = (error, retryable = false, data = null) => ({ success: false, data, error, retryable });
const SAFE_FIXES = new Set(['RESTART_VPN_SERVICE', 'RECONNECT_VPN', 'CLEAR_APP_CACHE', 'CLEAR_TEMP_FILES']);
const PRIVILEGED_FIXES = new Set(['RESET_PASSWORD', 'GRANT_FILE_ACCESS']);
const DIAGNOSTICS = new Set(['PING_GATEWAY', 'DNS_LOOKUP', 'DISK_CHECK']);
const URGENCIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const str = (v, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;
const isAdmin = (ctx) => ctx.user.role === 'IT_ADMIN';

function createTools({ store, kb }) {
  const res = (id) => store.findOne('systemstates', { resourceId: id });
  const setRes = (id, patch, cfg) => store.update('systemstates', { resourceId: id }, cfg ? { ...patch, configuration: cfg } : patch);
  // Dev fault injection: configuration.failNext = N makes the next N reads on that resource fail transiently.
  async function transient(r) {
    const n = r?.configuration?.failNext || 0;
    if (n > 0) { await setRes(r.resourceId, {}, { ...r.configuration, failNext: n - 1 }); return true; }
    return false;
  }
  const deviceOk = (a, ctx) => isAdmin(ctx) || a.deviceId === ctx.user.deviceId;

  async function verifyState(exec) {
    const c = exec.context || {}; const st = async (id) => (await res(id))?.status;
    switch (c.category) {
      case 'VPN_CONNECTIVITY': { const e = { internet: await st('internet'), vpnService: await st('vpn_service'), vpnConnection: await st('vpn_connection') };
        return { resolved: e.internet === 'AVAILABLE' && e.vpnService === 'RUNNING' && e.vpnConnection === 'CONNECTED', evidence: e }; }
      case 'INTERNET_CONNECTIVITY': { const e = { internet: await st('internet') }; return { resolved: e.internet === 'AVAILABLE', evidence: e }; }
      case 'EMAIL_ISSUE': { const e = { emailService: await st('email_service') }; return { resolved: e.emailService === 'AVAILABLE', evidence: e }; }
      case 'APPLICATION_ERROR': { const e = { application: await st(`app:${c.applicationName}`) }; return { resolved: e.application === 'HEALTHY', evidence: e }; }
      case 'FILE_ACCESS': { const r = await res(`file:${c.resourceId}`); const allowed = !!r?.configuration?.allowedUsers?.includes(c.userId);
        return { resolved: allowed, evidence: { fileAccess: allowed ? 'ALLOWED' : 'DENIED' } }; }
      case 'SLOW_SYSTEM': { const d = (await res(`device:${c.deviceId}`))?.configuration || {}; const e = { diskUsagePct: d.diskUsagePct, memoryPct: d.memoryPct };
        return { resolved: d.diskUsagePct <= 90 && d.memoryPct <= 85, evidence: e }; }
      case 'PASSWORD_RESET': { const u = await store.findOne('users', { id: c.userId }); const done = !!u?.passwordResetIssuedAt;
        return { resolved: done, evidence: { resetLinkIssued: done } }; }
      default: return { resolved: false, evidence: { reason: 'No verifiable outcome for this category' } };
    }
  }

  const registry = {
    checkInternetConnectivity: { validate: () => null, async run() {
      const r = await res('internet'); if (!r) return fail('RESOURCE_NOT_FOUND');
      if (await transient(r)) return fail('TIMEOUT', true);
      return ok({ status: r.status, errorCode: r.status === 'AVAILABLE' ? null : 'NET_NO_ROUTE' }); } },
    checkVPNStatus: { validate: () => null, async run() {
      const s = await res('vpn_service'), c = await res('vpn_connection'); if (!s || !c) return fail('RESOURCE_NOT_FOUND');
      if (await transient(s)) return fail('TIMEOUT', true);
      return ok({ service: s.status, connection: c.status }); } },
    checkEmailServiceStatus: { validate: () => null, async run() {
      const r = await res('email_service'); if (!r) return fail('RESOURCE_NOT_FOUND');
      if (await transient(r)) return fail('TIMEOUT', true);
      return ok({ status: r.status }); } },
    checkApplicationHealth: { validate: (a) => (str(a.applicationName, 50) ? null : 'applicationName required'), async run(a) {
      const r = await res(`app:${a.applicationName.toLowerCase()}`); if (!r) return fail('UNSUPPORTED_APPLICATION');
      if (await transient(r)) return fail('TIMEOUT', true);
      return ok({ status: r.status, lastError: r.configuration?.lastError || null }); } },
    checkFileAccess: { validate: (a) => (str(a.userId, 100) && str(a.resourceId, 100) ? null : 'userId and resourceId required'), async run(a, ctx) {
      if (!isAdmin(ctx) && a.userId !== ctx.user.id) return fail('FORBIDDEN');
      const r = await res(`file:${a.resourceId}`); if (!r) return fail('RESOURCE_NOT_FOUND');
      return ok({ access: r.configuration.allowedUsers.includes(a.userId) ? 'ALLOWED' : 'DENIED' }); } }, // never returns contents
    searchKnowledgeBase: { validate: (a) => (str(a.query, 500) ? null : 'query required'), async run(a) {
      const docs = await kb.search(a.query); return ok({ documents: docs }); } },
    getDeviceDiagnostics: { validate: (a) => (str(a.deviceId, 50) ? null : 'deviceId required'), async run(a, ctx) {
      if (!deviceOk(a, ctx)) return fail('FORBIDDEN');
      const r = await res(`device:${a.deviceId}`); if (!r) return fail('RESOURCE_NOT_FOUND');
      if (await transient(r)) return fail('TIMEOUT', true);
      const { diskUsagePct, memoryPct, tempFilesMb } = r.configuration; return ok({ diskUsagePct, memoryPct, tempFilesMb }); } },
    runPermittedDiagnostic: { validate: (a) => (DIAGNOSTICS.has(a.diagnosticType) && str(a.deviceId, 50) ? null : 'unsupported diagnosticType'), async run(a, ctx) {
      if (!deviceOk(a, ctx)) return fail('FORBIDDEN');
      if (a.diagnosticType === 'DISK_CHECK') { const d = await res(`device:${a.deviceId}`); return ok({ diagnosticType: a.diagnosticType, diskUsagePct: d?.configuration?.diskUsagePct }); }
      const n = await res('internet'); return ok({ diagnosticType: a.diagnosticType, reachable: n?.status === 'AVAILABLE' }); } },
    applySafeFix: { validate: (a) => (str(a.fixType, 50) && str(a.targetId, 100) ? null : 'fixType and targetId required'), async run(a, ctx) {
      if (PRIVILEGED_FIXES.has(a.fixType)) return fail('REQUIRES_APPROVAL');
      if (!SAFE_FIXES.has(a.fixType)) return fail('FIX_NOT_ALLOWED');
      await audit(store, ctx.user.id, 'FIX_INTENT', a.fixType, { targetId: a.targetId, executionId: ctx.executionId });
      const result = await applyFix(a);
      await audit(store, ctx.user.id, 'FIX_RESULT', a.fixType, { targetId: a.targetId, success: result.success, error: result.error });
      return result; } },
    createSupportTicket: { validate: (a) => (str(a.issue, 1000) && URGENCIES.has(a.urgency) ? null : 'issue and valid urgency required'), async run(a, ctx) {
      const { ticket, created } = await createTicket(store, { employeeId: ctx.user.id, conversationId: ctx.conversationId, issueCategory: ctx.category,
        urgency: a.urgency, description: a.issue, diagnosticSummary: a.diagnosticSummary, attemptedActions: ctx.attemptedActions || [],
        idempotencyKey: `${ctx.executionId}:ticket`, status: ctx.ticketStatus });
      return ok({ ticketId: ticket.ticketId, status: ticket.status, duplicate: !created }); } },
    getTicketStatus: { validate: (a) => (str(a.ticketId, 30) ? null : 'ticketId required'), async run(a, ctx) {
      const t = await store.findOne('tickets', { ticketId: a.ticketId });
      if (!t || (!isAdmin(ctx) && String(t.employeeId) !== ctx.user.id)) return fail('TICKET_NOT_FOUND');
      return ok({ ticketId: t.ticketId, status: t.status, resolution: t.resolution }); } },
    verifyResolution: { validate: (a) => (str(a.issueId, 100) ? null : 'issueId required'), async run(a, ctx) {
      const e = await store.findOne('executions', { id: a.issueId });
      if (!e || (!isAdmin(ctx) && String(e.userId) !== ctx.user.id)) return fail('EXECUTION_NOT_FOUND');
      return ok(await verifyState(e)); } },
  };

  async function applyFix({ fixType, targetId }) {
    if (fixType === 'RESTART_VPN_SERVICE') {
      const s = await res('vpn_service'); if (!s) return fail('RESOURCE_NOT_FOUND');
      if (s.configuration?.restartFails) return fail('RESTART_FAILED');
      await setRes('vpn_service', { status: 'RUNNING' });
      const c = await res('vpn_connection'), n = await res('internet');
      if (n.status === 'AVAILABLE' && !c.configuration?.reconnectBlocked) await setRes('vpn_connection', { status: 'CONNECTED' });
      return ok({ before: s.status, after: 'RUNNING' });
    }
    if (fixType === 'RECONNECT_VPN') {
      const s = await res('vpn_service'), c = await res('vpn_connection'), n = await res('internet');
      if (s.status !== 'RUNNING' || n.status !== 'AVAILABLE' || c.configuration?.reconnectBlocked) return fail('RECONNECT_FAILED');
      await setRes('vpn_connection', { status: 'CONNECTED' }); return ok({ before: c.status, after: 'CONNECTED' });
    }
    if (fixType === 'CLEAR_APP_CACHE') {
      const r = await res(`app:${targetId.toLowerCase()}`); if (!r) return fail('UNSUPPORTED_APPLICATION');
      const cfg = { ...r.configuration, cacheClearedAt: new Date().toISOString() };
      await setRes(r.resourceId, r.configuration?.cause === 'CACHE' ? { status: 'HEALTHY' } : {}, cfg);
      return ok({ before: r.status, after: r.configuration?.cause === 'CACHE' ? 'HEALTHY' : r.status });
    }
    if (fixType === 'CLEAR_TEMP_FILES') {
      const r = await res(`device:${targetId}`); if (!r) return fail('RESOURCE_NOT_FOUND');
      const c = r.configuration; await setRes(r.resourceId, {}, { ...c, tempFilesMb: 0, diskUsagePct: Math.max(0, c.diskUsagePct - (c.tempDiskPct || 10)) });
      return ok({ freedMb: c.tempFilesMb });
    }
    return fail('FIX_NOT_ALLOWED');
  }

  // Privileged actions: ONLY reachable from the approvals service after an IT_ADMIN approves (backend-enforced).
  async function executePrivileged(action) {
    if (action.fixType === 'GRANT_FILE_ACCESS') {
      const r = await res(`file:${action.targetId}`); if (!r) return fail('RESOURCE_NOT_FOUND');
      const set = new Set([...r.configuration.allowedUsers, action.forUserId]);
      await setRes(r.resourceId, {}, { ...r.configuration, allowedUsers: [...set] }); return ok({ granted: true });
    }
    if (action.fixType === 'RESET_PASSWORD') { // simulated: a reset link is issued; no password is ever generated, read or stored
      await store.update('users', { id: action.targetId }, { passwordResetIssuedAt: new Date() }); return ok({ resetLinkIssued: true });
    }
    return fail('FIX_NOT_ALLOWED');
  }

  return {
    names: () => Object.keys(registry), has: (n) => Object.prototype.hasOwnProperty.call(registry, n),
    verifyState, executePrivileged,
    async call(name, args, ctx) {
      if (!this.has(name)) return fail('TOOL_NOT_ALLOWED');
      const t = registry[name]; args = args && typeof args === 'object' ? args : {};
      const bad = t.validate(args); if (bad) return fail('INVALID_ARGS: ' + bad);
      try {
        const r = await t.run(args, ctx);
        if (!r || typeof r.success !== 'boolean') return fail('MALFORMED_TOOL_RESULT');
        return r;
      } catch (e) { return fail('TOOL_EXCEPTION: ' + e.message); }
    },
  };
}
module.exports = { createTools, PRIVILEGED_FIXES, SAFE_FIXES };
