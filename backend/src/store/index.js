// Tiny persistence interface: insert/find/findOne/update. Memory impl for tests + mock demos, Mongo impl for real runs.
const { randomUUID } = require('crypto');
function createMemoryStore({ dropEmpty = false } = {}) { // dropEmpty mimics Mongoose minimizing empty {} fields (used in tests)
  const strip = (d) => { if (dropEmpty) for (const k of Object.keys(d)) if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k]) && !(d[k] instanceof Date) && !Object.keys(d[k]).length) delete d[k]; return d; };
  const c = {};
  const col = (n) => c[n] || (c[n] = []);
  const match = (d, f) => Object.entries(f || {}).every(([k, v]) => String(d[k]) === String(v));
  return {
    async insert(n, doc) { const id = randomUUID(); const d = strip({ ...doc, _id: id, id, createdAt: new Date(), updatedAt: new Date() }); col(n).push(d); return { ...d }; },
    async find(n, f) { return col(n).filter((d) => match(d, f)).map((d) => ({ ...d })); },
    async findOne(n, f) { const d = col(n).find((x) => match(x, f)); return d ? { ...d } : null; },
    async update(n, f, p) { const d = col(n).find((x) => match(x, f)); if (!d) return null; Object.assign(d, p, { updatedAt: new Date() }); return { ...d }; },
  };
}
function createMongoStore() {
  const models = require('../models');
  const norm = (d) => d && { ...d, id: String(d._id) };
  const tf = (f) => { const o = { ...(f || {}) }; if (o.id) { o._id = o.id; delete o.id; } return o; };
  return {
    insert: async (n, doc) => norm((await models[n].create(doc)).toObject()),
    find: async (n, f) => (await models[n].find(tf(f)).sort({ createdAt: 1 }).lean()).map(norm),
    findOne: async (n, f) => norm(await models[n].findOne(tf(f)).lean()),
    update: async (n, f, p) => norm(await models[n].findOneAndUpdate(tf(f), { $set: p }, { new: true }).lean()),
  };
}
module.exports = { createMemoryStore, createMongoStore };
