import { useState } from 'react'; import { useNavigate } from 'react-router-dom'; import { api, session } from '../api.js'; import { ErrorBox } from '../components/ui.jsx';
export default function Login() {
  const nav = useNavigate(); const [mode, setMode] = useState('login'); const [f, setF] = useState({ name: '', email: '', password: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'register') await api('/auth/register', { method: 'POST', body: f });
      const r = await api('/auth/login', { method: 'POST', body: { email: f.email, password: f.password } });
      session.set({ token: r.token, user: r.user, agentMode: r.agentMode }); nav(r.user.role === 'IT_ADMIN' ? '/admin' : '/');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }
  return (
    <div className="mx-auto mt-16 max-w-sm px-4">
      <h1 className="mb-1 text-2xl font-semibold">IT Helpdesk Agent</h1>
      <p className="mb-6 text-sm text-slate-600">{mode === 'login' ? 'Sign in to describe a problem and track your tickets.' : 'Create an employee account.'}</p>
      <form onSubmit={submit} className="panel space-y-3 p-5">
        {mode === 'register' && <label className="block text-sm">Name<input className="input mt-1" value={f.name} onChange={set('name')} required /></label>}
        <label className="block text-sm">Email<input className="input mt-1" type="email" value={f.email} onChange={set('email')} required /></label>
        <label className="block text-sm">Password<input className="input mt-1" type="password" minLength={mode === 'register' ? 8 : 1} value={f.password} onChange={set('password')} required /></label>
        <ErrorBox error={err} />
        <button className="btn w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
      <button className="mt-3 text-sm text-signal underline" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>{mode === 'login' ? 'Create an account' : 'I already have an account'}</button>
      <p className="mt-6 text-xs text-slate-500">Demo accounts after seeding: alice@corp.test, bob@corp.test, admin@corp.test (password Passw0rd!).</p>
    </div>);
}
