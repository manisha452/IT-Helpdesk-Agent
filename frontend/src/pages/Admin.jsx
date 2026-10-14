import { Link } from 'react-router-dom'; import { api } from '../api.js'; import { ErrorBox, Spinner, useLoad } from '../components/ui.jsx'; import Tickets from './Tickets.jsx';
export default function Admin() {
  const t = useLoad(() => api('/tickets')); const a = useLoad(() => api('/approvals'));
  if (t.loading || a.loading) return <Spinner />;
  const count = (fn) => (t.data || []).filter(fn).length; const pend = (a.data || []).filter((x) => x.status === 'PENDING').length;
  const cards = [['Open', count((x) => x.status === 'OPEN')], ['In progress', count((x) => ['ASSIGNED', 'IN_PROGRESS'].includes(x.status))], ['Critical or high', count((x) => ['CRITICAL', 'HIGH'].includes(x.urgency) && !['RESOLVED', 'CLOSED'].includes(x.status))], ['Resolved', count((x) => x.status === 'RESOLVED')]];
  return (<div className="space-y-6"><h1 className="text-2xl font-semibold">IT administration</h1><ErrorBox error={t.error || a.error} />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{cards.map(([l, n]) => <div key={l} className="panel p-4"><div className="text-2xl font-semibold">{n}</div><div className="text-sm text-slate-600">{l}</div></div>)}
      <Link to="/approvals" className={`panel p-4 ${pend ? 'border-amber-300 bg-amber-50' : ''}`}><div className="text-2xl font-semibold">{pend}</div><div className="text-sm text-slate-600">Approvals waiting</div></Link></div>
    <Tickets /></div>);
}
