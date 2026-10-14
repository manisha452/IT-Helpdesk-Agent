import { Badge } from './ui.jsx';
const DOT = { COMPLETED: 'bg-emerald-600', FAILED: 'bg-red-600', RUNNING: 'bg-sky-600', PENDING: 'bg-slate-400', AWAITING_APPROVAL: 'bg-amber-500' };
// The execution trace: what the agent actually did, step by step. Shows tool results, not hidden reasoning.
export default function TracePanel({ execution }) {
  if (!execution) return <div className="panel p-6 text-sm text-slate-500">The agent's steps will appear here once you describe a problem.</div>;
  return (
    <section className="panel p-4" aria-label="Agent execution trace">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">What the agent did</h2><Badge value={execution.finalStatus} />
        <span className={`rounded px-2 py-0.5 text-xs ${execution.mode === 'mock' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'}`}>{execution.mode === 'mock' ? 'Mock mode: rule-based, no LLM' : `LLM-driven (${execution.llm || 'llm'})`}</span>
        {execution.retryCount > 0 && <span className="text-xs text-slate-500">{execution.retryCount} retr{execution.retryCount === 1 ? 'y' : 'ies'}</span>}
      </div>
      {execution.plan?.length > 0 && <details className="mb-3 text-sm"><summary className="cursor-pointer text-slate-600">Plan ({execution.plan.length} steps, adapts to results)</summary>
        <ol className="mt-1 list-decimal pl-5 text-slate-600">{execution.plan.map((p, i) => <li key={i}>{p}</li>)}</ol></details>}
      <ol className="relative ml-2 border-l-2 border-rail">
        {execution.steps.map((s, i) => (
          <li key={i} className="mb-4 ml-5">
            <span className={`absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full ring-4 ring-white ${DOT[s.status] || 'bg-slate-400'}`} />
            <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{s.name}</span><Badge value={s.status} />
              {s.tool && <code className="rounded bg-slate-100 px-1.5 text-xs">{s.tool}</code>}
              {s.retryCount > 0 && <span className="text-xs text-slate-500">retried {s.retryCount}×</span>}</div>
            {s.summary && <p className="mt-0.5 break-words text-sm text-slate-600">{s.summary}</p>}
            {s.error && <p className="mt-0.5 text-sm text-red-700">Error: {s.error}</p>}
          </li>))}
      </ol>
    </section>);
}
