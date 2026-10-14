import { useState } from 'react'; import { api } from '../api.js'; import { ErrorBox, Spinner, useLoad } from '../components/ui.jsx';
const PRESETS = [
  ['VPN stopped', [['vpn_service', { status: 'STOPPED' }], ['vpn_connection', { status: 'DISCONNECTED' }]]],
  ['Internet down', [['internet', { status: 'UNAVAILABLE' }]]],
  ['CRM unhealthy (fixable by cache clear)', [['app:crm', { status: 'UNHEALTHY', configuration: { cause: 'CACHE' } }]]],
  ['CRM unhealthy (not fixable)', [['app:crm', { status: 'UNHEALTHY', configuration: { cause: 'CORRUPT' } }]]],
  ['Flaky internet check (fails twice)', [['internet', { configuration: { failNext: 2 } }]]],
  ['Everything healthy', [['internet', { status: 'AVAILABLE', configuration: { failNext: 0 } }], ['vpn_service', { status: 'RUNNING' }], ['vpn_connection', { status: 'CONNECTED', configuration: { reconnectBlocked: false } }], ['app:crm', { status: 'HEALTHY', configuration: { cause: null } }], ['email_service', { status: 'AVAILABLE' }]]]];
function Row({ r, onSaved, onError }) {
  const [status, setStatus] = useState(r.status); const [cfg, setCfg] = useState(JSON.stringify(r.configuration || {}));
  async function save() { try { await api(`/system-state/${encodeURIComponent(r.resourceId)}`, { method: 'PATCH', body: { status, configuration: JSON.parse(cfg) } }); onSaved(); } catch (e) { onError(e.message); } }
  return <tr className="border-b border-rail align-top last:border-0"><td className="p-2 text-sm font-medium">{r.resourceId}</td><td><input className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={`${r.resourceId} status`} /></td>
    <td><textarea className="input font-mono text-xs" rows={2} value={cfg} onChange={(e) => setCfg(e.target.value)} aria-label={`${r.resourceId} configuration`} /></td><td className="p-2"><button className="btn-ghost" onClick={save}>Save</button></td></tr>;
}
export default function DevControls() {
  const { data, error, loading, reload } = useLoad(() => api('/system-state')); const [err, setErr] = useState('');
  async function preset(steps) { setErr(''); try { for (const [id, body] of steps) await api(`/system-state/${encodeURIComponent(id)}`, { method: 'PATCH', body }); reload(); } catch (e) { setErr(e.message); } }
  if (loading) return <Spinner />;
  return (<div className="space-y-4"><div><h1 className="text-2xl font-semibold">Simulated environment</h1>
    <p className="text-sm text-slate-600">Development only. Break something here, then ask the agent for help as an employee and watch it diagnose the fault. Nothing touches a real system.</p></div>
    <ErrorBox error={error || err} />
    <section><h2 className="mb-2 font-semibold">Scenarios</h2><div className="flex flex-wrap gap-2">{PRESETS.map(([n, s]) => <button key={n} className="btn-ghost" onClick={() => preset(s)}>{n}</button>)}</div></section>
    <div className="panel overflow-x-auto"><table className="w-full text-left"><thead className="border-b border-rail text-sm text-slate-600"><tr><th className="p-2">Resource</th><th>Status</th><th>Configuration (JSON)</th><th /></tr></thead>
      <tbody>{(data || []).map((r) => <Row key={r.resourceId + JSON.stringify(r.configuration) + r.status} r={r} onSaved={reload} onError={setErr} />)}</tbody></table></div></div>);
}
