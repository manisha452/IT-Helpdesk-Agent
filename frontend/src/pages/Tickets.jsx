import { useState } from 'react'; import { Link } from 'react-router-dom'; import { api, session } from '../api.js'; import { Badge, Empty, ErrorBox, Spinner, fmt, useLoad } from '../components/ui.jsx';
export default function Tickets() {
  const { data, error, loading } = useLoad(() => api('/tickets')); const [f, setF] = useState('ALL'); const admin = session.get().user.role === 'IT_ADMIN';
  if (loading) return <Spinner />;
  const rows = (data || []).filter((t) => f === 'ALL' || t.status === f);
  return (<div><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-semibold">{admin ? 'All tickets' : 'My tickets'}</h1>
    <select className="input w-auto" aria-label="Filter by status" value={f} onChange={(e) => setF(e.target.value)}>{['ALL', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'RESOLVED', 'CLOSED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>)}</select></div>
    <ErrorBox error={error} />
    {!rows.length ? <Empty>No tickets match.</Empty> : <div className="panel overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-rail text-slate-600"><tr>
      <th className="p-3">Ticket</th><th>Issue</th><th>Urgency</th><th>Status</th><th>Opened</th></tr></thead><tbody>
      {rows.map((t) => <tr key={t.id} className="border-b border-rail last:border-0 hover:bg-slate-50"><td className="p-3"><Link className="text-signal underline" to={`/tickets/${t.ticketId}`}>{t.ticketId}</Link></td>
        <td className="max-w-xs truncate">{t.description}</td><td><Badge value={t.urgency} /></td><td><Badge value={t.status} /></td><td className="text-slate-600">{fmt(t.createdAt)}</td></tr>)}</tbody></table></div>}</div>);
}
