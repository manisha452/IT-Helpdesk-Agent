const audit = require('./audit');
// Backend-enforced approval gate. Only IT_ADMIN reaches this; privileged actions execute nowhere else.
async function decide({ store, tools, admin, approvalId, approve, note }) {
  const ap = await store.findOne('approvals', { id: approvalId });
  if (!ap) return { status: 404, error: 'Approval not found' };
  if (ap.status !== 'PENDING') return { status: 409, error: `Approval already ${ap.status}` };
  if (String(ap.requestedBy) === admin.id) return { status: 403, error: 'Requester cannot review their own request' };
  const stamp = { reviewedBy: admin.id, decisionNote: note || '', reviewedAt: new Date() };
  const ticket = await store.findOne('tickets', { ticketId: ap.ticketId });
  if (!approve) {
    await store.update('approvals', { id: ap.id }, { status: 'REJECTED', ...stamp });
    await store.update('tickets', { ticketId: ap.ticketId }, { status: 'OPEN', notes: [...(ticket.notes || []), { by: admin.id, text: `Rejected ${ap.actionType}: ${note || ''}`, at: new Date() }] });
    await audit(store, admin.id, 'APPROVAL_REJECTED', ap.actionId, { note });
    return { status: 200, approval: await store.findOne('approvals', { id: ap.id }) };
  }
  const run = await tools.executePrivileged(ap.proposedAction);
  const exec = await store.findOne('executions', { id: ap.proposedAction.executionId });
  const v = run.success ? await tools.verifyState(exec) : { resolved: false, evidence: { error: run.error } };
  await store.update('approvals', { id: ap.id }, { status: 'APPROVED', ...stamp });
  await store.update('tickets', { ticketId: ap.ticketId }, { status: v.resolved ? 'RESOLVED' : 'IN_PROGRESS', assignedAdmin: admin.id,
    resolution: v.resolved ? `${ap.actionType} approved and verified by ${admin.name}` : null });
  await store.update('executions', { id: exec.id }, { finalStatus: v.resolved ? 'COMPLETED' : 'ESCALATED', summary: v.resolved ? `Approved by IT admin and verified (${JSON.stringify(v.evidence)}).` : 'Approved action did not verify.' });
  await audit(store, admin.id, 'APPROVAL_APPROVED', ap.actionId, { verified: v.resolved });
  return { status: 200, approval: await store.findOne('approvals', { id: ap.id }), verification: v };
}
module.exports = { decide };
