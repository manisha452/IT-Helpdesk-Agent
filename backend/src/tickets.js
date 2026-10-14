const { randomBytes } = require('crypto');
const audit = require('./audit');
async function createTicket(store, t) {
  if (t.idempotencyKey) { const ex = await store.findOne('tickets', { idempotencyKey: t.idempotencyKey }); if (ex) return { ticket: ex, created: false }; }
  const doc = { ticketId: 'TKT-' + randomBytes(3).toString('hex').toUpperCase(), employeeId: t.employeeId, conversationId: t.conversationId,
    issueCategory: t.issueCategory, urgency: t.urgency, description: t.description, diagnosticSummary: t.diagnosticSummary || '',
    attemptedActions: t.attemptedActions || [], assignedAdmin: null, status: t.status || 'OPEN', resolution: null, notes: [] };
  if (t.idempotencyKey) doc.idempotencyKey = t.idempotencyKey;
  const ticket = await store.insert('tickets', doc);
  await audit(store, t.employeeId, 'TICKET_CREATED', ticket.ticketId, { urgency: t.urgency });
  return { ticket, created: true };
}
module.exports = { createTicket };
