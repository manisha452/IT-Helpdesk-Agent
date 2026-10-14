const KEY = 'helpdesk.session';
export const session = { get: () => JSON.parse(localStorage.getItem(KEY) || 'null'), set: (s) => localStorage.setItem(KEY, JSON.stringify(s)), clear: () => localStorage.removeItem(KEY) };
export async function api(path, { method = 'GET', body } = {}) {
  const s = session.get();
  const res = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: `Bearer ${s.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && s) { session.clear(); window.location.assign('/login'); }
  if (!res.ok) throw new Error(data?.error?.message || `Request failed (${res.status})`);
  return data;
}
