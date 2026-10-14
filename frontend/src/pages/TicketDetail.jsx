import { useState } from 'react'; import { useParams } from 'react-router-dom'; import { api, session } from '../api.js';
import TracePanel from '../components/TracePanel.jsx'; import { Badge, ErrorBox, Spinner, fmt, useLoad } from '../components/ui.jsx';
export default function TicketDetail() {
  const { id } = useParams(); const s = session.get(); const admin = s.user.role === 'IT_ADMIN';
  const { data: t, error, loading, reload } = useLoad(() => api(`/tickets/${id}`), [id]); const ap = useLoad(() => (admin ? api('/approvals') : Promise.resolve([])), [id]);
  const [status, setStatus] = useState(''); const [note, setNote] = useState(''); const [resolution, setResolution] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  if (loading) return <Spinner />; if (error) return <ErrorBox error={error} />;
  const pending = (ap.data || []).filter((a) => a.ticketId === t.ticketId && a.status === 'PENDING');
  async function save(e, extra = {}) { e.preventDefault(); setErr(''); setMsg('');
    try { await api(`/tickets/${t.ticketId}/status`, { method: 'PATCH', body: { status: status || t.status, note: note || undefined, resolution: resolution || undefined, ...extra } }); setNote(''); setMsg('Ticket updated.'); reload(); } catch (e2) { setErr(e2.message); } }
  async function decide(a, kind) { setErr(''); try { await api(`/approvals/${a.id}/${kind}`, { method: 'POST', body: { note: note || undefined } }); setNote(''); reload(); ap.reload(); } catch (e2) { setErr(e2.message); } }
  return (
    <div className="grid gap-6 lg:grid-cols-2"><div className="space-y-4">
      <div><h1 className="text-2xl font-semibold">{t.ticketId}</h1><div className="mt-1 flex gap-2"><Badge value={t.status} /><Badge value={t.urgency} /><span className="text-sm text-slate-600">{t.issueCategory?.replace(/_/g, ' ').toLowerCase()} · opened {fmt(t.createdAt)}</span></div></div>
      <section className="panel space-y-3 p-4 text-sm"><div><h2 className="font-semibold">Issue</h2><p>{t.description}</p></div>
        {t.diagnosticSummary && <div><h2 className="font-semibold">Diagnostics</h2><pre className="overflow-x-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{t.diagnosticSummary}</pre></div>}
        <div><h2 className="font-semibold">Actions attempted</h2>{t.attemptedActions?.length ? <ul className="list-disc pl-5">{t.attemptedActions.map((a, i) => <li key={i}>{a.replace(':', ' on ')}</li>)}</ul> : <p className="text-slate-500">None. The agent made no changes.</p>}</div>
        {t.resolution && <div><h2 className="font-semibold">Resolution</h2><p>{t.resolution}</p></div>}
        {t.notes?.length > 0 && <div><h2 className="font-semibold">Internal notes</h2><ul className="space-y-1">{t.notes.map((n, i) => <li key={i} className="rounded bg-slate-50 p-2">{n.text}<span className="ml-2 text-xs text-slate-500">{fmt(n.at)}</span></li>)}</ul></div>}
      </section>
      {admin && <section className="panel space-y-3 p-4 text-sm" aria-label="Administrator actions"><h2 className="font-semibold">Administrator actions</h2>
        {pending.map((a) => <div key={a.id} className="rounded border border-amber-200 bg-amber-50 p-3"><p className="font-medium">Proposed action: {a.actionType.replace(/_/g, ' ').toLowerCase()}</p>
          <p className="text-slate-700">Target: {a.proposedAction.targetId}. Nothing runs until you approve.</p>
          <div className="mt-2 flex gap-2"><button className="btn" onClick={() => decide(a, 'approve')}>Approve</button><button className="btn-ghost" onClick={() => decide(a, 'reject')}>Reject</button></div></div>)}
        <form onSubmit={save} className="space-y-2">
          <label className="block">Status<select className="input mt-1" value={status || t.status} onChange={(e) => setStatus(e.target.value)}>{['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'RESOLVED', 'CLOSED'].map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ').toLowerCase()}</option>)}</select></label>
          <label className="block">Internal note<textarea className="input mt-1" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <label className="block">Resolution (when resolving)<input className="input mt-1" value={resolution} onChange={(e) => setResolution(e.target.value)} /></label>
          <div className="flex gap-2"><button className="btn">Save changes</button><button type="button" className="btn-ghost" onClick={(e) => save(e, { assignedAdmin: s.user.id, status: status || (t.status === 'OPEN' ? 'ASSIGNED' : t.status) })}>Assign to me</button></div></form>
        {msg && <p className="text-emerald-700" role="status">{msg}</p>}<ErrorBox error={err} /></section>}
    </div>
      <div>{t.executions?.length ? <TracePanel execution={t.executions[t.executions.length - 1]} /> : <div className="panel p-6 text-sm text-slate-500">This ticket was not created by the agent, so there is no trace.</div>}</div></div>);
}
