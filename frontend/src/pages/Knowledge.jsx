import { useState } from 'react'; import { api } from '../api.js'; import { Badge, Empty, ErrorBox, Spinner, useLoad } from '../components/ui.jsx';
export default function Knowledge() {
  const { data, error, loading, reload } = useLoad(() => api('/knowledge')); const [f, setF] = useState({ title: '', category: 'VPN_CONNECTIVITY', content: '' }); const [err, setErr] = useState(''); const [q, setQ] = useState(''); const [hits, setHits] = useState(null);
  async function add(e) { e.preventDefault(); setErr(''); try { await api('/knowledge', { method: 'POST', body: f }); setF({ ...f, title: '', content: '' }); reload(); } catch (e2) { setErr(e2.message); } }
  async function search(e) { e.preventDefault(); try { setHits(await api('/knowledge/search', { method: 'POST', body: { query: q } })); } catch (e2) { setErr(e2.message); } }
  if (loading) return <Spinner />;
  return (<div className="grid gap-6 lg:grid-cols-2"><div className="space-y-3"><h1 className="text-2xl font-semibold">Knowledge base</h1><ErrorBox error={error} />
    <form onSubmit={search} className="flex gap-2"><input className="input" placeholder="Test retrieval with a question…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /><button className="btn">Search</button></form>
    {hits && (hits.length ? <ul className="panel divide-y divide-rail text-sm">{hits.map((h) => <li key={h.id} className="p-3">{h.title} <span className="text-slate-500">relevance {h.score}</span></li>)}</ul> : <Empty>No relevant document. The agent would ask for more detail or escalate.</Empty>)}
    <ul className="space-y-2">{(data || []).map((d) => <li key={d.id} className="panel p-3"><div className="flex items-center gap-2"><span className="font-medium">{d.title}</span><Badge value={d.category} /></div><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{d.content}</p></li>)}</ul></div>
    <form onSubmit={add} className="panel h-fit space-y-3 p-4"><h2 className="font-semibold">Add a document</h2>
      <label className="block text-sm">Title<input className="input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></label>
      <label className="block text-sm">Category<input className="input mt-1" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} required /></label>
      <label className="block text-sm">Symptoms, diagnostic steps, safe actions, escalation conditions<textarea className="input mt-1" rows={8} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} required /></label>
      <ErrorBox error={err} /><button className="btn">Add document</button></form></div>);
}
