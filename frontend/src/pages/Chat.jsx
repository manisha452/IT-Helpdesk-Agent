import { useEffect, useRef, useState } from 'react'; import { Link, useParams } from 'react-router-dom'; import { api, session } from '../api.js';
import TracePanel from '../components/TracePanel.jsx'; import { ErrorBox, Spinner } from '../components/ui.jsx';
const EXAMPLES = ['I cannot connect to the office VPN.', 'My laptop cannot connect to the internet.', 'I forgot my password.', 'The CRM application keeps crashing.', 'I cannot access the finance-share shared folder.'];
export default function Chat() {
  const { id } = useParams(); const [convId, setConvId] = useState(id || null); const [msgs, setMsgs] = useState([]); const [execs, setExecs] = useState([]);
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [loading, setLoading] = useState(!!id); const end = useRef(null);
  useEffect(() => { if (!id) return;
    Promise.all([api(`/conversations/${id}/messages`), api(`/conversations/${id}/executions`)]).then(([m, e]) => { setMsgs(m); setExecs(e); }).catch((e) => setErr(e.message)).finally(() => setLoading(false)); }, [id]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);
  async function send(message) {
    if (!message.trim() || busy) return; setErr(''); setBusy(true); setText(''); setMsgs((m) => [...m, { id: 'tmp' + Date.now(), sender: 'EMPLOYEE', content: message }]);
    try {
      let cid = convId; if (!cid) { cid = (await api('/conversations', { method: 'POST' })).id; setConvId(cid); }
      const r = await api(`/conversations/${cid}/messages`, { method: 'POST', body: { message, idempotencyKey: crypto.randomUUID() } });
      setMsgs((m) => [...m, { id: r.execution.id, sender: 'AGENT', content: r.reply }]); setExecs((e) => [...e, r.execution]);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  if (loading) return <Spinner />;
  const latest = execs[execs.length - 1];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="panel flex h-[70vh] flex-col" aria-label="Conversation">
        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {msgs.length === 0 && <div className="text-sm text-slate-600"><p className="mb-2">Describe the problem. For example:</p>
            <div className="flex flex-wrap gap-2">{EXAMPLES.map((e) => <button key={e} className="btn-ghost text-left" onClick={() => send(e)}>{e}</button>)}</div></div>}
          {msgs.map((m) => <div key={m.id} className={`max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.sender === 'EMPLOYEE' ? 'ml-auto bg-ink text-white' : 'bg-slate-100'}`}>{m.content}</div>)}
          {busy && <div className="text-sm text-slate-500" role="status">The agent is running checks…</div>}<div ref={end} />
        </div>
        <div className="border-t border-rail p-3"><ErrorBox error={err} />
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe the problem…" maxLength={2000} aria-label="Message" />
            <button className="btn" disabled={busy || !text.trim()}>Send</button></form></div>
      </section>
      <div className="space-y-3">
        <TracePanel execution={latest} />
        {latest?.ticketId && <Link className="text-sm text-signal underline" to={`/tickets/${latest.ticketId}`}>Open ticket {latest.ticketId}</Link>}
        {session.get()?.agentMode === 'mock' && <p className="text-xs text-slate-500">This server is running in mock mode: decisions come from fixed rules, not an LLM.</p>}
      </div>
    </div>);
}
