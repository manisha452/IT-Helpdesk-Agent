const mongoose = require('mongoose');
const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;
const M = (name, fields, idx = []) => {
  if (mongoose.models[name]) return mongoose.models[name];
  const s = new Schema(fields, { timestamps: true, minimize: false });
  idx.forEach((i) => s.index(...i));
  return mongoose.model(name, s);
};
const URG = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
module.exports = {
  users: M('User', { name: { type: String, required: true, trim: true }, email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true }, role: { type: String, enum: ['EMPLOYEE', 'IT_ADMIN'], default: 'EMPLOYEE' },
    deviceId: String, passwordResetIssuedAt: Date }),
  conversations: M('Conversation', { employeeId: { type: ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, default: 'ACTIVE' }, issueCategory: String, issueSummary: String, currentPlan: [String] }),
  messages: M('Message', { conversationId: { type: ObjectId, ref: 'Conversation', required: true, index: true },
    sender: { type: String, enum: ['EMPLOYEE', 'AGENT'], required: true }, content: { type: String, required: true, maxlength: 4000 } }),
  knowledge: M('KnowledgeDocument', { title: { type: String, required: true }, category: { type: String, required: true },
    content: { type: String, required: true }, metadata: Mixed }, [[{ category: 1 }]]),
  systemstates: M('SystemState', { resourceId: { type: String, required: true, unique: true }, resourceType: String,
    status: { type: String, required: true }, configuration: Mixed }),
  tickets: M('SupportTicket', { ticketId: { type: String, unique: true, required: true }, employeeId: { type: ObjectId, ref: 'User', index: true },
    conversationId: { type: ObjectId, ref: 'Conversation' }, issueCategory: String, urgency: { type: String, enum: URG },
    description: String, diagnosticSummary: String, attemptedActions: [String], assignedAdmin: { type: ObjectId, ref: 'User' },
    status: { type: String, enum: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'RESOLVED', 'CLOSED'], default: 'OPEN' },
    resolution: String, notes: [Mixed], idempotencyKey: { type: String, unique: true, sparse: true } }),
  executions: M('AgentExecution', { conversationId: { type: ObjectId, ref: 'Conversation', index: true }, userId: ObjectId, issueId: String,
    idempotencyKey: String, mode: String, llm: String, state: String, plan: [String], steps: [Mixed], toolResults: [Mixed], retryCount: Number,
    attemptedActions: [String], context: Mixed, ticketId: String, summary: String, finalStatus: String, startedAt: Date, completedAt: Date },
    [[{ conversationId: 1, idempotencyKey: 1 }]]),
  approvals: M('ApprovalRequest', { actionId: { type: String, unique: true, required: true }, ticketId: String, requestedBy: ObjectId,
    actionType: String, proposedAction: Mixed, status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    reviewedBy: ObjectId, decisionNote: String, reviewedAt: Date }),
  audit: M('AuditLog', { actor: String, action: String, target: String, detail: Mixed }),
  diagnostics: M('DiagnosticRun', { userId: ObjectId, diagnosticType: String, deviceId: String, result: Mixed }),
};
