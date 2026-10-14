import { Link } from 'react-router-dom'; import { api, session } from '../api.js'; import { Badge, Empty, ErrorBox, Spinner, fmt, useLoad } from '../components/ui.jsx';
export default function Dashboard() {
  const s = session.get(); const t = useLoad(() => api('/tickets')); const c = useLoad(() => api('/conversations'));
  if (t.loading || c.loading) return <Spinner />;
  const open = (t.data || []).filter((x) => !['RESOLVED', 'CLOSED'].includes(x.status));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Hi {s.user.name.split(' ')[0]}, what's not working?</h1>
          <p className="text-sm text-slate-600">Describe the problem in your own words. The agent runs checks and shows you each step.</p></div>
        <Link to="/chat" className="btn">Get help</Link>
      </div>
      <ErrorBox error={t.error || c.error} />
      <section><h2 className="mb-2 font-semibold">Open tickets ({open.length})</h2>
        {open.length === 0 ? <Empty>No open tickets. Start a chat if something needs fixing.</Empty> :
          <ul className="panel divide-y divide-rail">{open.map((x) => <li key={x.id}><Link to={`/tickets/${x.ticketId}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
            <span><span className="font-medium">{x.ticketId}</span> <span className="text-sm text-slate-600">{x.description?.slice(0, 80)}</span></span><Badge value={x.status} /></Link></li>)}</ul>}
      </section>
      <section><h2 className="mb-2 font-semibold">Recent conversations</h2>
        {(c.data || []).length === 0 ? <Empty>No conversations yet.</Empty> :
          <ul className="panel divide-y divide-rail">{c.data.slice(-5).reverse().map((x) => <li key={x.id}><Link to={`/chat/${x.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
            <span>{x.issueCategory ? x.issueCategory.replace(/_/g, ' ').toLowerCase() : 'New conversation'}<span className="ml-2 text-xs text-slate-500">{fmt(x.createdAt)}</span></span><Badge value={x.status} /></Link></li>)}</ul>}
      </section>
    </div>);
}
