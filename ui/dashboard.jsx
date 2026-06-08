// Dashboard screen — KPI cards, bar chart, activity feed
const { useMemo: useMemoDash } = React;

function Sparkline({ values, color = "#01696f" }) {
  if (!values || values.length < 2) return null;
  const w = 64, h = 22;
  const max = Math.max(...values), min = Math.min(...values);
  const range = Math.max(1, max - min);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <polyline points={pts} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KPI({ icon, label, value, delta, direction = "up", sparkValues, ago, color = "teal" }) {
  const sparkColors = {
    teal: '#01696f', purple: '#7c3aed', amber: '#d97706',
    rose: '#db2777', sky: '#0284c7', emerald: '#059669',
  };
  return (
    <div className={`kpi ${color}`}>
      <div className="kpi-label">
        <div className="ic"><Icon name={icon} size={14} /></div>
        <span>{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-meta">
        {delta && (
          <span className={`delta ${direction}`}>
            <Icon name={direction === 'up' ? 'trending' : 'chevdown'} size={12} />
            {delta}
          </span>
        )}
        <span className="ago">{ago}</span>
      </div>
      {sparkValues && sparkValues.length >= 2 && <Sparkline values={sparkValues} color={sparkColors[color]} />}
    </div>
  );
}

function BarChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="empty" style={{ padding: '40px 20px' }}>
        No pipeline runs yet — run the pipeline to see lead history.
      </div>
    );
  }
  const W = 720, H = 220, P = { t: 14, r: 10, b: 28, l: 32 };
  const innerW = W - P.l - P.r;
  const innerH = H - P.t - P.b;
  const max = Math.max(...data.map(d => d.v)) * 1.1 || 10;
  const stepX = innerW / data.length;
  const barW = stepX * 0.55;
  const niceMax = Math.ceil(max / 10) * 10;
  const ticks = [0, niceMax * 0.25, niceMax * 0.5, niceMax * 0.75, niceMax];

  return (
    <svg className="bar-chart" viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="bgQual" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#01696f" />
          <stop offset="100%" stopColor="#4dd0d6" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => {
        const y = P.t + innerH - (t / niceMax) * innerH;
        return (
          <g key={i}>
            <line className="chart-grid" x1={P.l} x2={P.l + innerW} y1={y} y2={y} strokeWidth="1" strokeDasharray={i === 0 ? "0" : "2 3"} />
            <text className="chart-axis" x={P.l - 8} y={y + 3} textAnchor="end" fontSize="10">{Math.round(t)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = P.l + i * stepX + (stepX - barW) / 2;
        const hTotal = (d.v / niceMax) * innerH;
        const hQual = (d.q / niceMax) * innerH;
        const yTotal = P.t + innerH - hTotal;
        const yQual = P.t + innerH - hQual;
        const last = i === data.length - 1;
        return (
          <g key={i}>
            <rect className="chart-total" x={x} y={yTotal} width={barW} height={hTotal} rx="3" />
            <rect x={x} y={yQual} width={barW} height={hQual} rx="3" fill="url(#bgQual)" />
            <text className="chart-axis" x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize="10">{d.d.replace('May ', '')}</text>
            {last && hTotal > 0 && (
              <g>
                <rect x={x + barW / 2 - 22} y={yTotal - 24} width="44" height="20" rx="4" className="chart-tooltip-bg" />
                <text x={x + barW / 2} y={yTotal - 10} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="500">{d.v}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function activityFromLeads(leads) {
  return leads.slice(0, 7).map(l => {
    const kind = l.status === 'replied' ? 'reply'
               : l.status === 'emailed' ? 'send'
               : l.status === 'qualified' ? 'qualified'
               : 'found';
    const text = l.status === 'replied'   ? 'replied to your outreach'
               : l.status === 'emailed'   ? 'received intro email'
               : l.status === 'qualified' ? `scored ${l.score}/10 — qualified`
               : 'discovered';
    return { id: l.id, kind, who: l.company || l.domain, company: '', text, time: l.date };
  });
}

function ActivityIcon({ kind }) {
  const map = {
    reply:     { c: 'green',  i: 'reply'   },
    qualified: { c: 'teal',   i: 'sparkle' },
    send:      { c: 'blue',   i: 'send'    },
    found:     { c: 'teal',   i: 'target'  },
    open:      { c: 'orange', i: 'mail'    },
    error:     { c: 'red',    i: 'info'    },
  };
  const m = map[kind] || map.found;
  return <div className={`activity-ic ${m.c}`}><Icon name={m.i} size={14} /></div>;
}

function DashboardScreen({ apiStats, onNavigate }) {
  const [leads, setLeads] = React.useState([]);

  React.useEffect(() => {
    API.getLeads()
      .then(rows => { if (rows) setLeads(rows.map(window.adaptLead)); })
      .catch(() => {});
  }, []);

  const total     = apiStats ? apiStats.total_leads     : 0;
  const qualified = apiStats ? apiStats.qualified_leads : 0;
  const sent      = apiStats ? apiStats.emails_sent     : 0;
  const replyRate = apiStats ? (apiStats.reply_rate * 100).toFixed(1) + '%' : '0%';
  const activity  = activityFromLeads(leads);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <React.Fragment>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">{today}</div>
        </div>
        <div className="page-head-actions">
          <button className="btn"><Icon name="download" size={14} /> Export</button>
          <button className="btn btn-primary" onClick={() => onNavigate && onNavigate('pipeline')}>
            <Icon name="play" size={13} /> Run pipeline
          </button>
        </div>
      </div>

      <div className="hero">
        <svg className="hero-decor" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="80" stroke="#4dd0d6" strokeWidth="1" opacity="0.4" />
          <circle cx="100" cy="100" r="60" stroke="#7c3aed" strokeWidth="1" opacity="0.5" />
          <circle cx="100" cy="100" r="40" stroke="#db2777" strokeWidth="1" opacity="0.5" />
          <circle cx="100" cy="100" r="6" fill="#4dd0d6" />
        </svg>
        <div className="hero-row">
          <div>
            <h2>Welcome to LeadEngine</h2>
            <div className="hero-sub">
              {total === 0
                ? 'Run your first pipeline to start discovering leads.'
                : <span>You have <b style={{ color: '#fff' }}>{total} leads</b> — {qualified} qualified, {sent} emails sent.</span>}
            </div>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="v">{total}</div>
              <div className="l">total leads</div>
            </div>
            <div className="hero-stat">
              <div className="v">{qualified}</div>
              <div className="l">qualified</div>
            </div>
            <div className="hero-stat">
              <div className="v">{sent}</div>
              <div className="l">emails sent</div>
            </div>
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <KPI color="teal"   icon="users"   label="Total Leads" value={total.toLocaleString()}     ago="all time" />
        <KPI color="purple" icon="target"  label="Qualified"   value={qualified.toLocaleString()} ago={total ? `${Math.round(qualified / total * 100)}% of total` : '—'} />
        <KPI color="amber"  icon="send"    label="Emails Sent" value={sent.toLocaleString()}       ago={`${apiStats ? apiStats.emails_this_week : 0} this week`} />
        <KPI color="rose"   icon="reply"   label="Reply Rate"  value={replyRate}                  ago="of sent emails" />
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-head" style={{ justifyContent: 'space-between' }}>
            <div>
              <h3>Leads per day</h3>
              <div className="sub">Discovered vs. qualified</div>
            </div>
          </div>
          <div className="chart-wrap">
            <BarChart data={window.CHART_DAYS} />
          </div>
        </div>

        <div className="card">
          <div className="card-head" style={{ justifyContent: 'space-between' }}>
            <div>
              <h3>Recent activity</h3>
              <div className="sub">Latest leads</div>
            </div>
            <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={() => onNavigate && onNavigate('leads')}>View all</button>
          </div>
          {activity.length === 0 ? (
            <div className="empty" style={{ padding: '40px 20px' }}>No leads yet — run the pipeline to get started.</div>
          ) : (
            <div className="activity">
              {activity.map(a => (
                <div className="activity-item" key={a.id}>
                  <ActivityIcon kind={a.kind} />
                  <div className="activity-body">
                    <div><b>{a.who}</b></div>
                    <div>{a.text}</div>
                    <div className="ts">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </React.Fragment>
  );
}

window.DashboardScreen = DashboardScreen;
window.KPI = KPI;
window.BarChart = BarChart;
window.Sparkline = Sparkline;
