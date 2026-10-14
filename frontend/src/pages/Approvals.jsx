import { useState } from 'react'; import { Link } from 'react-router-dom'; import { api } from '../api.js'; import { Badge, Empty, ErrorBox, Spinner, fmt, useLoad } from '../components/ui.jsx';
export default function Approvals() {
  const { data, error, loading, reload } = useLoad(() => api('/approvals')); const [notes, setNotes] = useState({}); const [err, setErr] = useState(''); const [res, setRes] = useState('');
  async function decide(a, kind) { setErr(''); setRes(''); try { const r = await api(`/approvals/${a.id}/${kind}`, { method: 'POST', body: { note: notes[a.id] } });
    setRes(kind === 'approve' ? `Approved. Verification ${r.verification?.resolved ? 'passed' : 'did not pass'}.` : 'Rejected. Nothing was executed.'); reload(); } catch (e) { setErr(e.message); } }
  if (loading) return <Spinner />;
  const list = [...(data || [])].reverse();
  return (<div><h1 className="mb-1 text-2xl font-semibold">Approvals</h1><p className="mb-4 text-sm text-slate-600">Privileged actions run only after approval here. The server enforces this, not the page.</p>
    <ErrorBox error={error || err} />{res && <p className="mb-3 text-sm text-emerald-700" role="status">{res}</p>}
    {!list.length ? <Empty>No approval requests.</Empty> : <ul className="space-y-3">{list.map((a) => <li key={a.id} className="panel p-4"><div className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{a.actionType.replace(/_/g, ' ').toLowerCase()}</span><Badge value={a.status} /><Link className="text-sm text-signal underline" to={`/tickets/${a.ticketId}`}>{a.ticketId}</Link><span className="text-xs text-slate-500">{fmt(a.createdAt)}</span></div>
      <p className="mt-1 text-sm text-slate-700">Target: {a.proposedAction?.targetId}</p>
      {a.status === 'PENDING' ? <div className="mt-3 flex flex-wrap gap-2"><input className="input max-w-sm" placeholder="Decision note" aria-label="Decision note" value={notes[a.id] || ''} onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })} />
        <button className="btn" onClick={() => decide(a, 'approve')}>Approve</button><button className="btn-ghost" onClick={() => decide(a, 'reject')}>Reject</button></div>
        : a.decisionNote && <p className="mt-1 text-sm text-slate-600">Note: {a.decisionNote}</p>}</li>)}</ul>}</div>);
}
