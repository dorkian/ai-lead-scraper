// Reports — live data from /api/stats and /api/leads
function FunnelRow({ label, value, total, from, to }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="funnel-row">
      <div>
        <div className="label">{label}</div>
        <div className="pct">{pct}% of total</div>
      </div>
      <div className="funnel-bar">
        <div style={{ width: `${pct}%`, '--bar-from': from, '--bar-to': to }} />
      </div>
      <div className="v">{value.toLocaleString()}</div>
    </div>
  );
}

function ReportsScreen() {
  const [stats, setStats] = React.useState(null);
  const [leads, setLeads] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([
      API.getStats().catch(() => null),
      API.getLeads().catch(() => []),
    ]).then(([s, ls]) => {
      setStats(s);
      if (ls) setLeads(ls.map(window.adaptLead));
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty">Loading reports…</div>;

  const total     = stats ? stats.total_leads     : 0;
  const qualified = stats ? stats.qualified_leads : 0;
  const sent      = stats ? stats.emails_sent     : 0;
  const replyRate = stats ? stats.reply_rate      : 0;
  const bySource  = stats ? stats.leads_by_source : {};

  const stages = [
    { label: 'Discovered', v: total,                              from: '#7c3aed', to: '#a78bfa' },
    { label: 'Qualified',  v: qualified,                         from: '#01696f', to: '#4dd0d6' },
    { label: 'Emailed',    v: sent,                              from: '#d97706', to: '#fbbf24' },
    { label: 'Replied',    v: Math.round(sent * replyRate),      from: '#059669', to: '#34d399' },
  ];

  const sourceColors = {
    gmaps:   { color: '#1d4ed8', bg: 'var(--blue-bg)',   icon: 'map',     label: 'Google Maps' },
    reddit:  { color: '#c2570c', bg: 'var(--orange-bg)', icon: 'redditc', label: 'Reddit'      },
    website: { color: '#7c3aed', bg: 'var(--purple-bg)', icon: 'globe',   label: 'Website'     },
  };
  const sourceTotal = Object.values(bySource).reduce((a, b) => a + b, 0) || 1;
  const sources = Object.entries(bySource).map(([key, count]) => ({
    name:  (sourceColors[key] || {}).label || key,
    desc:  key === 'gmaps' ? 'Local business directories' : key === 'reddit' ? 'Relevant thread authors' : 'Direct scrape',
    count,
    pct:   Math.round((count / sourceTotal) * 100),
    color: (sourceColors[key] || { color: '#6b7280' }).color,
    bg:    (sourceColors[key] || { bg: 'var(--surface-muted)' }).bg,
    icon:  (sourceColors[key] || { icon: 'globe' }).icon,
  }));

  const topLeads = [...leads].sort((a, b) => b.score - a.score).slice(0, 5);

  if (total === 0) {
    return (
      <React.Fragment>
        <div className="page-head">
          <div><h1>Reports</h1><div className="sub">Pipeline analytics</div></div>
        </div>
        <div className="empty" style={{ padding: '80px 20px' }}>
          No data yet. Run the pipeline to start generating reports.
        </div>
      </React.Fragment>
    );
  }

  return (
    <React.Fragment>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <div className="sub">Pipeline health · all time</div>
        </div>
        <div className="page-head-actions">
          <button className="btn"><Icon name="download" size={14} /> Export PDF</button>
        </div>
      </div>

      <div className="kpi-grid">
        <KPI color="teal"   icon="users"  label="Total Leads" value={total.toLocaleString()}     ago="all time" />
        <KPI color="purple" icon="target" label="Qualified"   value={qualified.toLocaleString()} ago={total ? `${Math.round(qualified / total * 100)}% of total` : '—'} />
        <KPI color="amber"  icon="send"   label="Emails Sent" value={sent.toLocaleString()}      ago={`${stats ? stats.emails_this_week : 0} this week`} />
        <KPI color="rose"   icon="reply"  label="Reply Rate"  value={(replyRate * 100).toFixed(1) + '%'} ago="of sent emails" />
      </div>

      <div className="report-grid">
        <div className="card span-8">
          <div className="card-head">
            <h3>Conversion funnel</h3>
            <div className="sub">From discovery to reply</div>
          </div>
          <div className="card-body">
            {stages.map(s => (
              <FunnelRow key={s.label} label={s.label} value={s.v} total={total} from={s.from} to={s.to} />
            ))}
          </div>
        </div>

        <div className="card span-4">
          <div className="card-head">
            <h3>Source mix</h3>
            <div className="sub">Where leads came from</div>
          </div>
          <div className="card-body">
            {sources.length === 0 ? (
              <div className="empty" style={{ padding: 20 }}>No source data yet.</div>
            ) : (
              <React.Fragment>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 18px' }}>
                  <svg width="180" height="180" viewBox="0 0 180 180">
                    <circle cx="90" cy="90" r="62" fill="none" stroke="var(--surface-muted)" strokeWidth="22" />
                    {(() => {
                      const C = 2 * Math.PI * 62;
                      let offset = 0;
                      return sources.map((s, i) => {
                        const len = (s.pct / 100) * C;
                        const el = (
                          <circle key={i} cx="90" cy="90" r="62"
                            fill="none" stroke={s.color} strokeWidth="22"
                            strokeDasharray={`${len} ${C - len}`}
                            strokeDashoffset={-offset}
                            transform="rotate(-90 90 90)"
                            strokeLinecap="butt"
                          />
                        );
                        offset += len + 3;
                        return el;
                      });
                    })()}
                    <text x="90" y="86" textAnchor="middle" fontSize="24" fontWeight="600" fill="var(--ink)">{total}</text>
                    <text x="90" y="104" textAnchor="middle" fontSize="11" fill="var(--ink-3)">total leads</text>
                  </svg>
                </div>
                {sources.map(s => (
                  <div className="src-row" key={s.name}>
                    <div className="src-ic" style={{ background: s.bg, color: s.color }}>
                      <Icon name={s.icon} size={14} />
                    </div>
                    <div className="src-meta">
                      <b>{s.name}</b>
                      <div className="sub">{s.desc}</div>
                    </div>
                    <div className="src-bar"><div style={{ width: `${s.pct}%`, background: s.color }} /></div>
                    <div className="src-v">{s.count}</div>
                  </div>
                ))}
              </React.Fragment>
            )}
          </div>
        </div>

        {topLeads.length > 0 && (
          <div className="card span-12">
            <div className="card-head">
              <h3>Top performers</h3>
              <div className="sub">Highest-scoring leads</div>
            </div>
            <div style={{ padding: '4px 18px 14px' }}>
              {topLeads.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i === topLeads.length - 1 ? 'none' : '1px solid var(--line-2)' }}>
                  <div style={{ width: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12, fontWeight: 600 }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{t.company}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t.domain}</div>
                  </div>
                  <span className={`badge status ${t.status}`}>{t.status}</span>
                  <span className={`badge score ${t.score >= 7 ? 'green' : t.score >= 5 ? 'yellow' : 'red'}`}>{t.score}/10</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </React.Fragment>
  );
}

window.ReportsScreen = ReportsScreen;
