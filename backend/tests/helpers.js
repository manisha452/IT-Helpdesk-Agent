Invoke-RestMethod http://127.0.0.1:11434/api/tagsconst request = require('supertest'); const { createApp } = require('../src/app'); const { createMemoryStore } = require('../src/store'); const { seed } = require('../src/seed'); const { MockLLM } = require('../src/agent/llm');
async function setup(llm = new MockLLM(), storeOpts = {}) {
  const store = createMemoryStore(storeOpts); const users = await seed(store, { rounds: 4 }); const app = createApp({ store, llm });
  const login = async (email) => (await request(app).post('/api/auth/login').send({ email, password: 'Passw0rd!' })).body.token;
  const t = { alice: await login('alice@corp.test'), bob: await login('bob@corp.test'), admin: await login('admin@corp.test') };
  const api = (m, url, token, body) => { const r = request(app)[m](url); if (token) r.set('Authorization', `Bearer ${token}`); return body ? r.send(body) : r; };
  const chat = async (token, message, key, convId) => {
    const id = convId || (await api('post', '/api/conversations', token)).body.id;
    const r = await api('post', `/api/conversations/${id}/messages`, token, { message, idempotencyKey: key }); return { ...r.body, convId: id, status: r.status };
  };
  const setState = (id, body) => api('patch', `/api/system-state/${encodeURIComponent(id)}`, t.admin, body);
  const state = async (id) => (await api('get', '/api/system-state', t.admin)).body.find((r) => r.resourceId === id);
  return { store, users, app, t, api, chat, setState, state };
}
module.exports = { setup };
