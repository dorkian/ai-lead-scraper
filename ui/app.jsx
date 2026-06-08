// App shell — sidebar + topbar + screen routing
const { useState: useStateApp, useEffect: useEffectApp, useRef: useRefApp } = React;

const ROUTES = {
  dashboard: { label: 'Dashboard',     crumb: 'Overview' },
  leads:     { label: 'Leads',         crumb: 'Pipeline' },
  configure: { label: 'Configure',     crumb: 'Settings' },
  pipeline:  { label: 'Run Pipeline',  crumb: 'Automation' },
  outreach:  { label: 'Outreach',       crumb: 'Email' },
  inbox:     { label: 'Inbox',         crumb: 'Conversations' },
  reports:   { label: 'Reports',       crumb: 'Analytics' },
  settings:  { label: 'Settings',      crumb: 'Workspace' },
};


function useOutsideClick(ref, onClose) {
  useEffectApp(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}

function NotifDropdown({ open, onClose, items, onMarkAll, onOpenInbox }) {
  const ref = useRefApp(null);
  useOutsideClick(ref, () => open && onClose());
  if (!open) return null;
  const unread = items.filter(i => i.unread).length;
  return (
    <div className="dropdown" ref={ref}>
      <div className="dropdown-head">
        <h4>Notifications {unread > 0 && <span className="badge status qualified" style={{ marginLeft: 6 }}>{unread} new</span>}</h4>
        <button className="mark-all" onClick={onMarkAll}>Mark all read</button>
      </div>
      <div className="dropdown-list">
        {items.map(n => (
          <button key={n.id} className={`dropdown-item ${n.unread ? 'unread' : ''}`}>
            <div className="ic" style={{ background: n.bg, color: n.color }}>
              <Icon name={n.icon} size={14} />
            </div>
            <div className="body">
              <div><b>{n.who}</b>{n.co ? <span style={{ color: 'var(--ink-3)' }}> · {n.co}</span> : null} {n.text}</div>
              <div className="ts">{n.time}</div>
            </div>
          </button>
        ))}
      </div>
      <div className="dropdown-foot">
        <a href="#" onClick={(e) => { e.preventDefault(); onClose(); onOpenInbox(); }}>Open inbox →</a>
      </div>
    </div>
  );
}

function HelpDropdown({ open, onClose }) {
  const ref = useRefApp(null);
  useOutsideClick(ref, () => open && onClose());
  if (!open) return null;
  const items = [
    { icon: 'sparkle', color: '#7c3aed', bg: 'var(--purple-bg)', label: 'What\'s new',        meta: 'v1.0 · Reddit source' },
    { icon: 'info',    color: '#0284c7', bg: 'var(--sky-bg)',     label: 'Documentation',      meta: 'github.com/leadengine' },
    { icon: 'mail',    color: '#d97706', bg: 'var(--amber-bg)',   label: 'Contact support',    meta: 'Avg reply < 4h' },
    { icon: 'play',    color: '#01696f', bg: 'var(--teal-50)',    label: 'Watch product tour', meta: '3 min' },
    { icon: 'list',    color: '#db2777', bg: 'var(--rose-bg)',    label: 'Keyboard shortcuts', kbd: '?' },
    { icon: 'ext',     color: '#6b7280', bg: 'var(--surface-muted)', label: 'Status page',    meta: 'All systems normal' },
  ];
  return (
    <div className="dropdown" ref={ref} style={{ width: 320 }}>
      <div className="dropdown-head">
        <h4>Help &amp; resources</h4>
      </div>
      <div className="help-list">
        {items.map((it, i) => (
          <button key={i} className="help-item">
            <div className="ic" style={{ background: it.bg, color: it.color }}>
              <Icon name={it.icon} size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>{it.label}</div>
              {it.meta && <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{it.meta}</div>}
            </div>
            {it.kbd ? <span className="kbd kbd-right">{it.kbd}</span> : <Icon name="chevright" size={12} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThemeToggle({ theme, onTheme }) {
  const effective = theme === 'dark' ? 'dark' : 'light';
  return (
    <button
      className="theme-toggle"
      onClick={() => onTheme(effective === 'dark' ? 'light' : 'dark')}
      title={effective === 'dark' ? 'Switch to light' : 'Switch to dark'}
    >
      <div className="glyph-bg">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>
      </div>
      <span className="knob">
        {effective === 'dark'
          ? <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>
          : <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>}
      </span>
    </button>
  );
}

function Toast({ toast, onDismiss }) {
  useEffectApp(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 3800);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);
  if (!toast) return null;
  return (
    <div className="toast-wrap">
      <div className={`toast ${toast.kind || 'info'}`}>
        <Icon name={toast.icon || 'check'} size={14} />
        <span>{toast.text}</span>
        <button className="x-btn" onClick={onDismiss}><Icon name="x" size={12} /></button>
      </div>
    </div>
  );
}

function App() {
  const [route, setRoute] = useStateApp('dashboard');
  const [theme, setTheme] = useStateApp(() => localStorage.getItem('le-theme') || 'light');
  const [notifs, setNotifs] = useStateApp([]);
  const [notifOpen, setNotifOpen] = useStateApp(false);
  const [helpOpen, setHelpOpen] = useStateApp(false);
  const [toast, setToast] = useStateApp(null);
  const [apiStats, setApiStats] = useStateApp(null);

  useEffectApp(() => {
    const eff = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    document.documentElement.setAttribute('data-theme', eff);
    localStorage.setItem('le-theme', theme);
  }, [theme]);

  useEffectApp(() => {
    const handler = (e) => setToast(e.detail);
    window.addEventListener('le-toast', handler);
    return () => window.removeEventListener('le-toast', handler);
  }, []);

  useEffectApp(() => {
    const handler = (e) => setRoute(e.detail);
    window.addEventListener('le-navigate', handler);
    return () => window.removeEventListener('le-navigate', handler);
  }, []);

  // Load real stats once on mount
  useEffectApp(() => {
    API.getStats().then(s => setApiStats(s)).catch(() => {});
  }, []);

  const unread = notifs.filter(n => n.unread).length;
  const totalLeads = apiStats ? apiStats.total_leads : window.LEADS.length;
  const counts = { leads: totalLeads, unread };

  let screen = null;
  if (route === 'dashboard') screen = <DashboardScreen apiStats={apiStats} onNavigate={setRoute} />;
  else if (route === 'leads')     screen = <LeadsScreen />;
  else if (route === 'configure') screen = <ConfigureScreen />;
  else if (route === 'pipeline')  screen = <PipelineScreen />;
  else if (route === 'outreach')  screen = <OutreachScreen />;
  else if (route === 'inbox')     screen = <InboxScreen />;
  else if (route === 'reports')   screen = <ReportsScreen />;
  else if (route === 'settings')  screen = <SettingsScreen theme={theme} onTheme={setTheme} />;

  return (
    <div className="app">
      <Sidebar route={route} onRoute={(r) => { setRoute(r); setNotifOpen(false); setHelpOpen(false); }} counts={counts} apiStats={apiStats} />
      <main className="main" data-screen-label={`${ROUTES[route].label}`}>
        <div className="topbar">
          <div className="crumb">LeadEngine <Icon name="chevright" size={12} /> {ROUTES[route].crumb} <Icon name="chevright" size={12} /> <b>{ROUTES[route].label}</b></div>
          <div className="search">
            <Icon name="search" size={14} />
            <input placeholder="Jump to a lead, company, or page…" />
          </div>
          <div className="spacer" />
          <ThemeToggle theme={theme} onTheme={setTheme} />
          <div className="dropdown-wrap">
            <button
              className="icon-btn"
              title="Notifications"
              onClick={(e) => { e.stopPropagation(); setHelpOpen(false); setNotifOpen(v => !v); }}
            >
              <Icon name="bell" size={15} />
              {unread > 0 && <span className="dot" />}
            </button>
            <NotifDropdown
              open={notifOpen}
              onClose={() => setNotifOpen(false)}
              items={notifs}
              onMarkAll={() => setNotifs(ns => ns.map(n => ({ ...n, unread: false })))}
              onOpenInbox={() => setRoute('inbox')}
            />
          </div>
          <div className="dropdown-wrap">
            <button
              className="icon-btn"
              title="Help"
              onClick={(e) => { e.stopPropagation(); setNotifOpen(false); setHelpOpen(v => !v); }}
            >
              <Icon name="info" size={15} />
            </button>
            <HelpDropdown open={helpOpen} onClose={() => setHelpOpen(false)} />
          </div>
        </div>
        <div className="content" data-screen-label={ROUTES[route].label}>
          {screen}
        </div>
      </main>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
