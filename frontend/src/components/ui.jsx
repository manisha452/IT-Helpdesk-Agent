import { useEffect, useState } from 'react';
const TONES = { green: 'bg-emerald-50 text-emerald-800 border-emerald-200', red: 'bg-red-50 text-red-800 border-red-200', amber: 'bg-amber-50 text-amber-900 border-amber-200',
  blue: 'bg-sky-50 text-sky-800 border-sky-200', gray: 'bg-slate-100 text-slate-700 border-slate-200' };
const MAP = { COMPLETED: 'green', RESOLVED: 'green', APPROVED: 'green', CLOSED: 'gray', FAILED: 'red', REJECTED: 'red', CRITICAL: 'red', HIGH: 'amber', ESCALATED: 'amber', OPEN: 'amber',
  AWAITING_APPROVAL: 'amber', PENDING: 'amber', NEEDS_INFO: 'blue', RUNNING: 'blue', IN_PROGRESS: 'blue', ASSIGNED: 'blue', MEDIUM: 'blue', LOW: 'gray', ACTIVE: 'blue' };
export const Badge = ({ value }) => <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${TONES[MAP[value] || 'gray']}`}>{String(value || '').replace(/_/g, ' ').toLowerCase()}</span>;
export const Empty = ({ children }) => <div className="panel p-8 text-center text-sm text-slate-500">{children}</div>;
export const ErrorBox = ({ error }) => error ? <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null;
export const Spinner = ({ label = 'Loading' }) => <div className="p-6 text-sm text-slate-500" role="status">{label}…</div>;
export const fmt = (d) => (d ? new Date(d).toLocaleString() : '');
export function useLoad(fn, deps = []) {
  const [st, setSt] = useState({ data: null, error: '', loading: true });
  const load = () => { setSt((s) => ({ ...s, loading: true })); return fn().then((data) => setSt({ data, error: '', loading: false })).catch((e) => setSt({ data: null, error: e.message, loading: false })); };
  useEffect(() => { load(); }, deps); // eslint-disable-line
  return { ...st, reload: load };
}
