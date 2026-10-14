import { Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { session } from './api.js';
import Login from './pages/Login.jsx'; import Dashboard from './pages/Dashboard.jsx'; import Chat from './pages/Chat.jsx'; import History from './pages/History.jsx';
import Tickets from './pages/Tickets.jsx'; import TicketDetail from './pages/TicketDetail.jsx'; import Admin from './pages/Admin.jsx'; import Approvals from './pages/Approvals.jsx';
import Knowledge from './pages/Knowledge.jsx'; import DevControls from './pages/DevControls.jsx';

function Shell({ admin }) {
  const s = session.get(); const nav = useNavigate();
  if (!s) return <Navigate to="/login" replace />;
  if (admin && s.user.role !== 'IT_ADMIN') return <Navigate to="/" replace />;
  const link = ({ isActive }) => `rounded px-3 py-1.5 text-sm ${isActive ? 'bg-ink text-white' : 'text-slate-700 hover:bg-slate-200'}`;
  const isAdmin = s.user.role === 'IT_ADMIN';
  return (
    <div className="min-h-screen">
      <header className="border-b border-rail bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <span className="mr-4 font-semibold">IT Helpdesk Agent</span>
          <nav className="flex flex-1 flex-wrap gap-1" aria-label="Main">
            <NavLink to="/" end className={link}>Home</NavLink><NavLink to="/chat" className={link}>Get help</NavLink>
            <NavLink to="/history" className={link}>Conversations</NavLink><NavLink to="/tickets" className={link}>My tickets</NavLink>
            {isAdmin && <><NavLink to="/admin" className={link}>Admin</NavLink><NavLink to="/approvals" className={link}>Approvals</NavLink>
              <NavLink to="/knowledge" className={link}>Knowledge base</NavLink><NavLink to="/dev" className={link}>Simulated environment</NavLink></>}
          </nav>
          <span className="text-sm text-slate-600">{s.user.name}</span>
          <button className="btn-ghost" onClick={() => { session.clear(); nav('/login'); }}>Sign out</button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6"><Outlet /></main>
    </div>);
}
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} /><Route path="chat" element={<Chat />} /><Route path="chat/:id" element={<Chat />} />
        <Route path="history" element={<History />} /><Route path="tickets" element={<Tickets />} /><Route path="tickets/:id" element={<TicketDetail />} />
      </Route>
      <Route element={<Shell admin />}>
        <Route path="admin" element={<Admin />} /><Route path="approvals" element={<Approvals />} /><Route path="knowledge" element={<Knowledge />} /><Route path="dev" element={<DevControls />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>);
}
