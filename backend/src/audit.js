module.exports = (store, actor, action, target, detail = {}) => store.insert('audit', { actor: String(actor), action, target: String(target || ''), detail });
