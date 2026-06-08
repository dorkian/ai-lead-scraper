// Sidebar with logo, nav, stats card, user
const { useState } = React;

function Sidebar({ route, onRoute, counts, apiStats }) {
  const [senderName, setSenderName] = React.useState('');
  const [senderEmail, setSenderEmail] = React.useState('');

  React.useEffect(() => {
    API.getConfig()
      .then(cfg => {
        setSenderName(cfg?.outreach?.sender_name || '');
        setSenderEmail(cfg?.outreach?.sender_email || '');
      })
      .catch(() => {});
  }, []);

  const items = [
    { id: 'dashboard', label: 'Dashboard',    icon: 'home' },
    { id: 'leads',     label: 'Leads',        icon: 'users', count: counts.leads },
    { id: 'configure', label: 'Configure',    icon: 'sliders' },
    { id: 'pipeline',  label: 'Run Pipeline', icon: 'play' },
    { id: 'outreach',  label: 'Outreach',     icon: 'send' },
  ];
  const secondary = [
    { id: 'inbox',    label: 'Inbox',    icon: 'mail',  count: counts.unread },
    { id: 'reports',  label: 'Reports',  icon: 'chart' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  const totalLeads = apiStats ? apiStats.total_leads : 0;
  const dailyLimit = 50;
  const pct = Math.min(100, Math.round((totalLeads / dailyLimit) * 100));

  const initials = senderName
    ? senderName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'LE';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="mark"><Icon name="logo" size={18} /></div>
        <div className="name">LeadEngine<span> / v1</span></div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Workspace</div>
        <nav className="nav">
          {items.map(it => (
            <button
              key={it.id}
              className={`nav-item ${route === it.id ? 'active' : ''}`}
              onClick={() => onRoute(it.id)}
            >
              <Icon name={it.icon} size={16} />
              <span>{it.label}</span>
              {it.count != null && <span className="nav-count">{it.count}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">More</div>
        <nav className="nav">
          {secondary.map(it => (
            <button
              key={it.id}
              className={`nav-item ${route === it.id ? 'active' : ''}`}
              onClick={() => onRoute(it.id)}
            >
              <Icon name={it.icon} size={16} />
              <span>{it.label}</span>
              {it.count != null && <span className="nav-count">{it.count}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-spacer" />

      <div className="sidebar-stats">
        <div className="sidebar-stats-label">Total leads</div>
        <div className="sidebar-stats-value">
          {totalLeads}<span className="unit">/ {dailyLimit} daily</span>
        </div>
        <div className="bar"><div style={{ width: `${pct}%` }} /></div>
        <div className="sidebar-stats-foot">
          <span>{apiStats ? 'Live from DB' : 'Loading…'}</span>
          <span className="pos">{apiStats ? `${apiStats.qualified_leads} qualified` : ''}</span>
        </div>
      </div>

      <div className="sidebar-user">
        <div className="avatar">{initials}</div>
        <div className="who">
          <div className="name">{senderName || 'Configure account'}</div>
          <div className="org">{senderEmail || 'Settings → Account'}</div>
        </div>
        <button className="menu" title="Account" onClick={() => onRoute('settings')}>
          <Icon name="more" size={16} />
        </button>
      </div>
    </aside>
  );
}

window.Sidebar = Sidebar;
