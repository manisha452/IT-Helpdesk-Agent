import { Link } from 'react-router-dom'; import { api } from '../api.js'; import { Badge, Empty, ErrorBox, Spinner, fmt, useLoad } from '../components/ui.jsx';
export default function History() {
  const { data, error, loading } = useLoad(() => api('/conversations'));
  if (loading) return <Spinner />;
  return (<div><h1 className="mb-4 text-2xl font-semibold">Conversations</h1><ErrorBox error={error} />
    {!data?.length ? <Empty>No conversations yet. <Link className="text-signal underline" to="/chat">Get help</Link></Empty> :
      <ul className="panel divide-y divide-rail">{[...data].reverse().map((c) => <li key={c.id}><Link to={`/chat/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
        <span>{c.issueCategory ? c.issueCategory.replace(/_/g, ' ').toLowerCase() : 'No issue identified yet'}<span className="ml-2 text-xs text-slate-500">{fmt(c.createdAt)}</span></span><Badge value={c.status} /></Link></li>)}</ul>}</div>);
}
