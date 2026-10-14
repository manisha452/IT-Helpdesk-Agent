const bcrypt = require('bcryptjs');
const { createKb, DOCS } = require('./agent/kb');
const { createTicket } = require('./tickets');
async function seed(store, { rounds = 10 } = {}) {
  const hash = await bcrypt.hash('Passw0rd!', rounds); // synthetic demo password
  const alice = await store.insert('users', { name: 'Alice Employee', email: 'alice@corp.test', passwordHash: hash, role: 'EMPLOYEE', deviceId: 'LAPTOP-001' });
  const bob = await store.insert('users', { name: 'Bob Employee', email: 'bob@corp.test', passwordHash: hash, role: 'EMPLOYEE', deviceId: 'LAPTOP-002' });
  const admin = await store.insert('users', { name: 'Ivy IT Admin', email: 'admin@corp.test', passwordHash: hash, role: 'IT_ADMIN', deviceId: 'ADMIN-001' });
  const kb = createKb(store);
  for (const [title, category, content] of DOCS) await kb.addDocument({ title, category, content });
  const S = (resourceId, resourceType, status, configuration = {}) => store.insert('systemstates', { resourceId, resourceType, status, configuration });
  await S('internet', 'NETWORK', 'AVAILABLE'); await S('vpn_service', 'VPN', 'RUNNING'); await S('vpn_connection', 'VPN', 'CONNECTED');
  await S('email_service', 'EMAIL', 'AVAILABLE'); await S('app:crm', 'APPLICATION', 'HEALTHY', { cause: null }); await S('app:payroll', 'APPLICATION', 'HEALTHY', { cause: null });
  await S('file:finance-share', 'FILE', 'PROTECTED', { allowedUsers: [bob.id] }); await S('file:hr-docs', 'FILE', 'PROTECTED', { allowedUsers: [alice.id, bob.id] });
  await S('device:LAPTOP-001', 'DEVICE', 'ACTIVE', { diskUsagePct: 55, memoryPct: 60, tempFilesMb: 200, tempDiskPct: 10 });
  await S('device:LAPTOP-002', 'DEVICE', 'ACTIVE', { diskUsagePct: 50, memoryPct: 55, tempFilesMb: 100, tempDiskPct: 5 });
  await createTicket(store, { employeeId: bob.id, issueCategory: 'EMAIL_ISSUE', urgency: 'MEDIUM', description: 'Sample seeded ticket', idempotencyKey: 'seed-1' });
  return { alice, bob, admin };
}
module.exports = { seed };
