// GOAL -> UNDERSTAND -> RETRIEVE -> PLAN -> EXECUTE -> OBSERVE -> ADAPT -> VERIFY -> COMPLETE
const { limits } = require('../config');
const audit = require('../audit');
const rules = require('./rules');
const { validateClassification, validateDecision, validatePlan } = require('./validators');
const { PRIVILEGED_FIXES } = require('./tools');
const { LlmError } = require('./llmErrors');
const llmDown = (e) => e instanceof LlmError && e.code !== 'MALFORMED_RESPONSE';

const LABELS = { searchKnowledgeBase: 'Retrieving troubleshooting guide', checkInternetConnectivity: 'Checking internet connectivity', checkVPNStatus: 'Checking VPN service',
  checkEmailServiceStatus: 'Checking email service', checkApplicationHealth: 'Checking application health', checkFileAccess: 'Checking file permissions', getDeviceDiagnostics: 'Reading device diagnostics',
  runPermittedDiagnostic: 'Running permitted diagnostic', applySafeFix: 'Applying safe fix', verifyResolution: 'Verifying resolution' };
const summarize = (t, r) => (!r.success ? `Failed: ${r.error}` : t === 'searchKnowledgeBase' ? `${r.data.documents.length} document(s): ${r.data.documents.map((d) => d.title).join('; ') || 'none'}`
  : JSON.stringify(r.data).slice(0, 160));

async function runAgent({ store, llm, tools, kb, user, conversation, message, idempotencyKey }) {
  if (idempotencyKey) { const ex = await store.findOne('executions', { conversationId: conversation.id, idempotencyKey }); if (ex) return { execution: ex, duplicate: true }; }
  const prior = (await store.find('executions', { conversationId: conversation.id })).filter((e) => e.finalStatus !== 'RUNNING').pop();
  const E = await store.insert('executions', { conversationId: conversation.id, userId: user.id, idempotencyKey, mode: llm.mode, llm: llm.provider ? `${llm.provider}:${llm.model}` : 'mock', state: 'UNDERSTAND', plan: [], steps: [], toolResults: [],
    retryCount: 0, attemptedActions: [], context: {}, finalStatus: 'RUNNING', startedAt: new Date() });
  // Real databases (Mongoose) may drop empty objects/arrays on insert; never assume they come back.
  E.context = E.context || {}; E.steps = E.steps || []; E.toolResults = E.toolResults || []; E.attemptedActions = E.attemptedActions || []; E.plan = E.plan || [];
  E.issueId = E.id;
  const save = () => store.update('executions', { id: E.id }, { issueId: E.id, steps: E.steps, toolResults: E.toolResults, retryCount: E.retryCount, state: E.state, plan: E.plan,
    finalStatus: E.finalStatus, context: E.context, summary: E.summary, completedAt: E.completedAt, ticketId: E.ticketId, attemptedActions: E.attemptedActions });
  const addStep = async (name, tool = null) => { const st = { name, tool, status: 'RUNNING', summary: '', retryCount: 0, error: null, at: new Date() }; E.steps.push(st); await save(); return st; };
  const S = { category: null, context: E.context, docs: [], observations: [], attempted: [], toolCount: 0, verifyFailed: false };
  const ctx = { user, executionId: E.id, conversationId: conversation.id };
  let docsUsed = [];

  const conclude = async (finalStatus, text) => {
    const sources = docsUsed.length ? `\n\nSources: ${docsUsed.join('; ')}` : '';
    if (llm.endSession) llm.endSession(E.id);
    E.finalStatus = finalStatus; E.summary = text + sources; E.state = 'COMPLETE'; E.completedAt = new Date(); await save();
    await store.insert('messages', { conversationId: conversation.id, sender: 'AGENT', content: E.summary });
    await store.update('conversations', { id: conversation.id }, { issueCategory: E.context.category, currentPlan: E.plan, status: finalStatus });
    return { execution: { ...E }, duplicate: false };
  };
  const diagSummary = () => S.observations.map((o) => `${o.tool}${o.args && Object.keys(o.args).length ? JSON.stringify(o.args) : ''}: ${o.success ? JSON.stringify(o.data).slice(0, 100) : 'FAILED ' + o.error}`).join('\n');

  async function execTool(name, args) {
    const st = await addStep(LABELS[name] || name, name); let r, attempts = 0;
    for (;;) {
      if (S.toolCount >= limits.maxTools) { r = { success: false, data: null, error: 'TOOL_BUDGET_EXHAUSTED', retryable: false }; break; }
      S.toolCount++; r = await tools.call(name, args, ctx);
      if (r.success || !r.retryable || attempts >= limits.maxRetries) break;
      attempts++; E.retryCount++; st.retryCount = attempts; st.summary = `Retrying after ${r.error}`; await save();
    }
    st.status = r.success ? 'COMPLETED' : 'FAILED'; st.summary = summarize(name, r); st.error = r.error; st.retryCount = attempts;
    E.toolResults.push({ tool: name, args, result: r, at: new Date() });
    S.observations.push({ tool: name, args, success: r.success, data: r.data, error: r.error }); await save(); return r;
  }
  async function ticket(status) { // not counted against the tool budget: escalation must always be possible
    const st = await addStep(status === 'AWAITING_APPROVAL' ? 'Opening ticket for approval' : 'Escalating to IT administrator', 'createSupportTicket');
    const r = await tools.call('createSupportTicket', { issue: E.context.description || message.slice(0, 500), urgency: E.context.urgency, diagnosticSummary: diagSummary() },
      { ...ctx, category: E.context.category, attemptedActions: E.attemptedActions, ticketStatus: status });
    st.status = r.success ? 'COMPLETED' : 'FAILED'; st.summary = r.success ? `Ticket ${r.data.ticketId}${r.data.duplicate ? ' (existing)' : ''}` : r.error; st.error = r.error;
    if (r.success) E.ticketId = r.data.ticketId; await save(); return r;
  }
  const attemptsText = () => (E.attemptedActions.length ? ` Actions attempted: ${E.attemptedActions.map((a) => a.split(':')[0]).join(', ')}.` : '');
  async function escalate(reason) {
    E.state = 'ESCALATE'; const t = await ticket('OPEN');
    return conclude('ESCALATED', `I couldn't resolve this automatically: ${reason}.${attemptsText()} ${t.success ? `I created ticket ${t.data.ticketId} (urgency ${E.context.urgency}) for an IT administrator.` : 'Ticket creation failed; please contact IT directly.'}`);
  }
  async function ask(q) { const st = await addStep('Asking for clarification'); st.status = 'COMPLETED'; st.summary = q; return conclude('NEEDS_INFO', q); }
  async function requestApproval(d) {
    const { fixType, targetId } = d.args; E.state = 'AWAITING_APPROVAL';
    const t = await ticket('AWAITING_APPROVAL');
    const actionId = `${E.id}:${fixType}`;
    let ap = await store.findOne('approvals', { actionId });
    if (!ap) ap = await store.insert('approvals', { actionId, ticketId: E.ticketId, requestedBy: user.id, actionType: fixType, status: 'PENDING',
      proposedAction: { fixType, targetId, forUserId: user.id, executionId: E.id, reason: d.reason } });
    const st = await addStep('Waiting for administrator approval', 'applySafeFix'); st.status = 'AWAITING_APPROVAL'; st.summary = `${fixType} requires IT_ADMIN approval`;
    E.attemptedActions.push(`${fixType}:requested`); await audit(store, user.id, 'APPROVAL_REQUESTED', actionId, { fixType });
    return conclude('AWAITING_APPROVAL', `This requires IT administrator approval, so I haven't changed anything.${fixType === 'RESET_PASSWORD' ? ' I never handle passwords; once approved, a reset link goes to your registered email.' : ''} Ticket ${t.data?.ticketId || E.ticketId} is open and approval is pending.`);
  }

  // UNDERSTAND
  const us = await addStep('Understanding the issue');
  if (rules.INJECTION.test(message)) await audit(store, user.id, 'PROMPT_INJECTION_SUSPECTED', E.id, { excerpt: message.slice(0, 120) });
  let cls;
  try { cls = validateClassification(await llm.classify({ message, prior: prior?.context })); } catch (e) {
    if (llmDown(e)) { us.status = 'FAILED'; us.error = e.code; Object.assign(E.context, { category: 'UNKNOWN_ISSUE', description: message.slice(0, 200), userId: user.id, deviceId: user.deviceId, urgency: rules.urgency('UNKNOWN_ISSUE', message) }); await save();
      return escalate(`the AI agent was unavailable (${e.code}), so no automated troubleshooting was performed`); }
    us.status = 'FAILED'; us.error = 'Malformed classification'; return ask('I had trouble understanding that. Could you describe the problem again, including the device or application involved?'); }
  let followUp = false;
  if (cls.category === 'UNKNOWN_ISSUE' && prior?.context?.category && rules.FOLLOWUP.test(message)) { cls.category = prior.context.category; followUp = true; }
  Object.assign(E.context, { category: cls.category, description: cls.description || message.slice(0, 200), errorMessage: cls.errorMessage, userId: user.id, deviceId: user.deviceId,
    applicationName: cls.applicationName || (followUp ? prior.context.applicationName : null), resourceId: cls.resourceId || (followUp ? prior.context.resourceId : null),
    urgency: rules.urgency(cls.category, message), securityIssue: rules.SECURITY.test(message), humanRequested: rules.HUMAN.test(message) });
  if (followUp) E.attemptedActions = [...(prior.attemptedActions || [])];
  S.category = cls.category; S.attempted = E.attemptedActions;
  us.status = 'COMPLETED'; us.summary = `${cls.category}, urgency ${E.context.urgency}${followUp ? ' (follow-up on previous diagnostic)' : ''}`; await save();
  if (E.context.securityIssue) return escalate('this looks security-sensitive');
  if (E.context.humanRequested) return escalate('you asked for a human');
  if (cls.category === 'APPLICATION_ERROR' && !E.context.applicationName) return ask('Which application is affected (for example CRM or Payroll), and what error do you see?');
  if (cls.category === 'FILE_ACCESS' && !E.context.resourceId) return ask('Which shared folder or file do you need (for example finance-share or hr-docs)?');

  // RETRIEVE
  E.state = 'RETRIEVE';
  const kr = await execTool('searchKnowledgeBase', { query: cls.category === 'UNKNOWN_ISSUE' ? message : `${cls.category.replace(/_/g, ' ')} ${message}` });
  S.docs = kr.success ? kr.data.documents : []; docsUsed = S.docs.map((d) => d.title);
  if (!S.docs.length || cls.category === 'UNKNOWN_ISSUE') {
    if (cls.category === 'UNKNOWN_ISSUE') { docsUsed = []; return ask('I couldn\'t find a matching troubleshooting procedure. Could you tell me which device, application or service is affected, and any error message you see?'); }
    return escalate('the knowledge base has no safe procedure for this issue');
  }

  // PLAN
  E.state = 'PLAN'; const ps = await addStep('Creating plan');
  try { E.plan = validatePlan(await llm.plan({ category: cls.category, classification: cls, docs: S.docs })); ps.status = 'COMPLETED'; ps.summary = `${E.plan.length} steps (adapts to results)`; }
  catch { E.plan = ['Diagnose', 'Apply permitted fix', 'Verify', 'Escalate if unresolved']; ps.status = 'COMPLETED'; ps.summary = 'Fallback plan used'; }
  await save();

  // EXECUTE / OBSERVE / ADAPT / VERIFY
  E.state = 'EXECUTE';
  for (let iter = 0, violations = 0; ; iter++) {
    if (iter > limits.maxIterations) return escalate('the agent could not make progress');
    if (S.toolCount >= limits.maxTools) return escalate('the tool execution limit was reached without a verified fix');
    let d;
    try { d = validateDecision(await llm.decideNext({ category: S.category, context: { ...E.context }, docs: S.docs.map((x) => ({ title: x.title, content: x.content })),
      executionId: E.id, observations: S.observations, attempted: S.attempted, toolCount: S.toolCount, verifyFailed: S.verifyFailed })); }
    catch (e) { return escalate(llmDown(e) ? `the AI agent was unavailable (${e.code}), so troubleshooting stopped` : 'the agent produced an invalid action and failed safe'); }
    if (d.type === 'tool' && d.tool === 'verifyResolution') d = { type: 'finish' };
    if (d.type === 'ask') return ask(d.question);
    if (d.type === 'escalate') return escalate(d.reason);
    if (d.type === 'finish') {
      E.state = 'VERIFY'; const v = await execTool('verifyResolution', { issueId: E.id });
      if (v.success && v.data.resolved) {
        const ev = Object.entries(v.data.evidence).map(([k, x]) => `${k}=${x}`).join(', ');
        return conclude('COMPLETED', `Resolved and independently verified (${ev}).${attemptsText()}`);
      }
      S.verifyFailed = true; E.state = 'ADAPT'; continue;
    }
    if (d.tool === 'createSupportTicket') return escalate(d.reason || 'agent requested escalation');
    if (!tools.has(d.tool)) { S.observations.push({ tool: d.tool, args: d.args, success: false, error: 'TOOL_NOT_ALLOWED' }); if (++violations >= 2) return escalate('the agent requested disallowed tools'); continue; }
    if (d.tool === 'applySafeFix') {
      if (PRIVILEGED_FIXES.has(d.args.fixType)) return requestApproval(d);
      const key = `${d.args.fixType}:${d.args.targetId}`;
      if (S.attempted.includes(key)) { S.observations.push({ tool: 'applySafeFix', args: d.args, success: false, error: 'ALREADY_ATTEMPTED' }); continue; }
      S.attempted.push(key); E.attemptedActions = S.attempted;
    }
    await execTool(d.tool, d.args);
  }
}
module.exports = { runAgent };
