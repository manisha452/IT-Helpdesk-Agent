const express = require('express'); const cors = require('cors'); const bcrypt = require('bcryptjs'); const jwt = require('jsonwebtoken');
const cfg = require('./config'); const audit = require('./audit'); const { createKb } = require('./agent/kb'); const { createTools } = require('./agent/tools');
const { runAgent } = require('./agent/orchestrator'); const approvals = require('./approvals'); const { createTicket } = require('./tickets'); const { urgency } = require('./agent/rules');

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const strOk = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max;
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

function createApp({ store, llm, config = cfg }) {
  const kb = createKb(store); const tools = createTools({ store, kb });
  const app = express(); app.use(cors()); app.use(express.json({ limit: '50kb' }));
  const auth = wrap(async (req, _res, next) => {
    const h = req.headers.authorization || ''; if (!h.startsWith('Bearer ')) throw new HttpError(401, 'Authentication required');
    let p; try { p = jwt.verify(h.slice(7), config.jwtSecret); } catch { throw new HttpError(401, 'Invalid token'); }
    const u = await store.findOne('users', { id: p.sub }); if (!u) throw new HttpError(401, 'Unknown user'); req.user = u; next();
  });
  const role = (r) => (req, _res, next) => (req.user.role === r ? next() : next(new HttpError(403, 'Forbidden')));
  const devOnly = (req, _res, next) => (config.devControls && req.user.role === 'IT_ADMIN' ? next() : next(new HttpError(403, 'Development controls are disabled or restricted')));
  const isAdmin = (u) => u.role === 'IT_ADMIN';
  async function ownConversation(req, id) {
    const c = await store.findOne('conversations', { id }); if (!c) throw new HttpError(404, 'Conversation not found');
    if (!isAdmin(req.user) && String(c.employeeId) !== req.user.id) throw new HttpError(403, 'Forbidden'); return c;
  }

  // Auth (self-registration always yields EMPLOYEE; admins are seeded)
  app.post('/api/auth/register', wrap(async (req, res) => {
    const { name, email, password } = req.body || {};
    if (!strOk(name, 1, 80) || !strOk(email, 5, 120) || !/^\S+@\S+\.\S+$/.test(email) || !strOk(password, 8, 100)) throw new HttpError(400, 'Valid name, email and password (min 8 chars) required');
    if (await store.findOne('users', { email: email.toLowerCase() })) throw new HttpError(409, 'Email already registered');
    const u = await store.insert('users', { name, email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 10), role: 'EMPLOYEE', deviceId: 'LAPTOP-001' });
    res.status(201).json({ user: pub(u) });
  }));
  app.post('/api/auth/login', wrap(async (req, res) => {
    const { email, password } = req.body || {}; const u = strOk(email, 3, 120) && strOk(password, 1, 100) ? await store.findOne('users', { email: email.toLowerCase() }) : null;
    if (!u || !(await bcrypt.compare(password, u.passwordHash))) throw new HttpError(401, 'Invalid credentials');
    res.json({ token: jwt.sign({ sub: u.id, role: u.role }, config.jwtSecret, { expiresIn: '8h' }), user: pub(u), agentMode: llm.mode });
  }));

  // Conversations
  app.post('/api/conversations', auth, wrap(async (req, res) => res.status(201).json(await store.insert('conversations', { employeeId: req.user.id, status: 'ACTIVE', currentPlan: [] }))));
  app.get('/api/conversations', auth, wrap(async (req, res) => res.json(await store.find('conversations', isAdmin(req.user) ? {} : { employeeId: req.user.id }))));
  app.get('/api/conversations/:id', auth, wrap(async (req, res) => res.json(await ownConversation(req, req.params.id))));
  app.get('/api/conversations/:id/messages', auth, wrap(async (req, res) => { await ownConversation(req, req.params.id); res.json(await store.find('messages', { conversationId: req.params.id })); }));
  app.get('/api/conversations/:id/executions', auth, wrap(async (req, res) => { await ownConversation(req, req.params.id); res.json(await store.find('executions', { conversationId: req.params.id })); }));
  async function converse(req, res, convId, message, idempotencyKey) {
    if (!strOk(message, 1, 2000)) throw new HttpError(400, 'message required (max 2000 chars)');
    const conversation = await ownConversation(req, convId);
    if (String(conversation.employeeId) !== req.user.id) throw new HttpError(403, 'Only the owning employee can chat in this conversation');
    const dup = idempotencyKey && await store.findOne('executions', { conversationId: conversation.id, idempotencyKey });
    if (!dup) await store.insert('messages', { conversationId: conversation.id, sender: 'EMPLOYEE', content: message });
    const out = await runAgent({ store, llm, tools, kb, user: req.user, conversation, message, idempotencyKey });
    res.json({ agentMode: llm.mode, duplicate: out.duplicate, execution: out.execution, reply: out.execution.summary });
  }
  app.post('/api/conversations/:id/messages', auth, wrap((req, res) => converse(req, res, req.params.id, req.body?.message, req.body?.idempotencyKey)));
  app.post('/api/agent/run', auth, wrap((req, res) => converse(req, res, req.body?.conversationId, req.body?.message, req.body?.idempotencyKey)));
  app.get('/api/agent/executions/:id', auth, wrap(async (req, res) => {
    const e = await store.findOne('executions', { id: req.params.id }); if (!e) throw new HttpError(404, 'Execution not found');
    if (!isAdmin(req.user) && String(e.userId) !== req.user.id) throw new HttpError(403, 'Forbidden'); res.json(e);
  }));

  // Knowledge
  app.get('/api/knowledge', auth, wrap(async (_req, res) => res.json((await store.find('knowledge')).map(({ metadata, ...d }) => d))));
  app.post('/api/knowledge/search', auth, wrap(async (req, res) => { if (!strOk(req.body?.query, 1, 500)) throw new HttpError(400, 'query required'); res.json(await kb.search(req.body.query)); }));
  app.post('/api/knowledge', auth, role('IT_ADMIN'), wrap(async (req, res) => {
    const { title, category, content } = req.body || {}; if (!strOk(title, 1, 120) || !strOk(category, 1, 40) || !strOk(content, 1, 5000)) throw new HttpError(400, 'title, category, content required');
    const d = await kb.addDocument({ title, category, content }); await audit(store, req.user.id, 'KB_DOC_ADDED', d.id); res.status(201).json({ id: d.id, title });
  }));

  // Diagnostics (run through the same allowlisted tool + ownership checks)
  app.post('/api/diagnostics/run', auth, wrap(async (req, res) => {
    const { diagnosticType, deviceId } = req.body || {}; const r = await tools.call('runPermittedDiagnostic', { diagnosticType, deviceId }, { user: req.user });
    if (!r.success) throw new HttpError(r.error === 'FORBIDDEN' ? 403 : 400, r.error);
    res.status(201).json(await store.insert('diagnostics', { userId: req.user.id, diagnosticType, deviceId, result: r.data }));
  }));
  app.get('/api/diagnostics/:id', auth, wrap(async (req, res) => {
    const d = await store.findOne('diagnostics', { id: req.params.id }); if (!d) throw new HttpError(404, 'Not found');
    if (!isAdmin(req.user) && String(d.userId) !== req.user.id) throw new HttpError(403, 'Forbidden'); res.json(d);
  }));

  // Tickets
  const ownTicket = async (req, id) => { const t = await store.findOne('tickets', { ticketId: id }); if (!t) throw new HttpError(404, 'Ticket not found'); if (!isAdmin(req.user) && String(t.employeeId) !== req.user.id) throw new HttpError(403, 'Forbidden'); return t; };
  app.post('/api/tickets', auth, wrap(async (req, res) => {
    const { issue, issueCategory = 'UNKNOWN_ISSUE', idempotencyKey } = req.body || {}; if (!strOk(issue, 1, 1000)) throw new HttpError(400, 'issue required');
    const { ticket, created } = await createTicket(store, { employeeId: req.user.id, issueCategory, urgency: urgency(issueCategory, issue), description: issue, idempotencyKey });
    res.status(created ? 201 : 200).json(ticket);
  }));
  app.get('/api/tickets', auth, wrap(async (req, res) => res.json(await store.find('tickets', isAdmin(req.user) ? {} : { employeeId: req.user.id }))));
  app.get('/api/tickets/:id', auth, wrap(async (req, res) => { const t = await ownTicket(req, req.params.id); res.json({ ...t, executions: await store.find('executions', { ticketId: t.ticketId }) }); }));
  const STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'RESOLVED', 'CLOSED'];
  app.patch('/api/tickets/:id/status', auth, role('IT_ADMIN'), wrap(async (req, res) => {
    const t = await ownTicket(req, req.params.id); const { status, note, assignedAdmin, resolution } = req.body || {};
    if (!STATUSES.includes(status)) throw new HttpError(400, 'Invalid status');
    const patch = { status, notes: note ? [...(t.notes || []), { by: req.user.id, text: String(note).slice(0, 1000), at: new Date() }] : t.notes };
    if (assignedAdmin) patch.assignedAdmin = assignedAdmin; if (resolution) patch.resolution = String(resolution).slice(0, 1000);
    const u = await store.update('tickets', { ticketId: t.ticketId }, patch); await audit(store, req.user.id, 'TICKET_STATUS', t.ticketId, { status }); res.json(u);
  }));

  // Approvals (IT_ADMIN only; enforced here, never in the UI)
  app.get('/api/approvals', auth, role('IT_ADMIN'), wrap(async (_req, res) => res.json(await store.find('approvals'))));
  for (const [path, approve] of [['approve', true], ['reject', false]]) {
    app.post(`/api/approvals/:id/${path}`, auth, role('IT_ADMIN'), wrap(async (req, res) => {
      const r = await approvals.decide({ store, tools, admin: req.user, approvalId: req.params.id, approve, note: req.body?.note });
      if (r.error) throw new HttpError(r.status, r.error); res.json(r);
    }));
  }

  // Simulated environment (development only, admin only)
  app.get('/api/system-state', auth, devOnly, wrap(async (_req, res) => res.json(await store.find('systemstates'))));
  app.patch('/api/system-state/:resourceId', auth, devOnly, wrap(async (req, res) => {
    const r = await store.findOne('systemstates', { resourceId: req.params.resourceId }); if (!r) throw new HttpError(404, 'Resource not found');
    const { status, configuration } = req.body || {}; const patch = {};
    if (status !== undefined) { if (!strOk(status, 1, 30)) throw new HttpError(400, 'Invalid status'); patch.status = status; }
    if (configuration !== undefined) { if (typeof configuration !== 'object' || Array.isArray(configuration)) throw new HttpError(400, 'Invalid configuration'); patch.configuration = { ...r.configuration, ...configuration }; }
    const u = await store.update('systemstates', { resourceId: r.resourceId }, patch); await audit(store, req.user.id, 'SYSTEM_STATE_CHANGED', r.resourceId, patch); res.json(u);
  }));

  app.use((_req, _res, next) => next(new HttpError(404, 'Not found')));
  app.use((err, _req, res, _next) => { if (!err.status) console.error(err); res.status(err.status || 500).json({ error: { message: err.status ? err.message : 'Internal server error' } }); });
  return app;
}
module.exports = { createApp };
