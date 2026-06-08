// Settings — account / appearance / integrations / billing / team
function SettingsScreen({ theme, onTheme }) {
  const [section, setSection] = React.useState('account');
  const [notif, setNotif] = React.useState({ replies: true, qualified: true, daily: false, weekly: true, mentions: false });
  const [cfg, setCfg] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [tz, setTz] = React.useState('Europe/Rome');

  // Signature state
  const [sig, setSig] = React.useState({ name: '', title: '', company: '', website: '', phone: '', logo_url: '' });
  const [sigSaving, setSigSaving] = React.useState(false);
  const [logoPreviewError, setLogoPreviewError] = React.useState(false);

  React.useEffect(() => {
    API.getConfig().then(c => {
      if (!c) return;
      setCfg(c);
      setName(c.outreach?.sender_name || '');
      setEmail(c.outreach?.sender_email || '');
      setTz(c.outreach?.timezone || 'Europe/Rome');
      const s = c.signature || {};
      setSig({
        name:     s.name     || c.outreach?.sender_name || '',
        title:    s.title    || '',
        company:  s.company  || '',
        website:  s.website  || '',
        phone:    s.phone    || '',
        logo_url: s.logo_url || '',
      });
    }).catch(() => {});
  }, []);

  function handleSaveSignature() {
    if (!cfg) return;
    setSigSaving(true);
    const updated = { ...cfg, signature: sig };
    API.saveConfig(updated)
      .then(() => {
        setCfg(updated);
        window.dispatchEvent(new CustomEvent('le-toast', { detail: { kind: 'success', icon: 'check', text: 'Signature saved.' } }));
      })
      .catch(() => window.dispatchEvent(new CustomEvent('le-toast', { detail: { kind: 'error', icon: 'info', text: 'Save failed.' } })))
      .finally(() => setSigSaving(false));
  }

  function handleSaveAccount() {
    if (!cfg) return;
    setSaving(true);
    const updated = {
      ...cfg,
      outreach: { ...cfg.outreach, sender_name: name, sender_email: email, timezone: tz },
    };
    API.saveConfig(updated)
      .then(() => window.dispatchEvent(new CustomEvent('le-toast', { detail: { kind: 'success', icon: 'check', text: 'Account saved.' } })))
      .catch(() => window.dispatchEvent(new CustomEvent('le-toast', { detail: { kind: 'error', icon: 'info', text: 'Save failed.' } })))
      .finally(() => setSaving(false));
  }

  const nav = [
    { id: 'account',       label: 'Account',       icon: 'users'   },
    { id: 'signature',     label: 'Signature',     icon: 'mail'    },
    { id: 'appearance',    label: 'Appearance',    icon: 'sparkle' },
    { id: 'notifications', label: 'Notifications', icon: 'bell'    },
    { id: 'integrations',  label: 'Integrations',  icon: 'ext'     },
    { id: 'api',           label: 'API & Webhooks', icon: 'sliders' },
  ];

  const [gmailConnected, setGmailConnected] = React.useState(null);
  const [sheetsConfigured, setSheetsConfigured] = React.useState(null);
  const [sheetsUrl, setSheetsUrl] = React.useState('');
  const [sheetsExporting, setSheetsExporting] = React.useState(false);

  React.useEffect(() => {
    fetch('/api/gmail/status')
      .then(r => r.json())
      .then(d => setGmailConnected(d.authenticated))
      .catch(() => setGmailConnected(false));
    API.getSheetsStatus()
      .then(d => { setSheetsConfigured(d.configured); setSheetsUrl(d.url); })
      .catch(() => setSheetsConfigured(false));
  }, []);

  const exportSheets = async () => {
    setSheetsExporting(true);
    try {
      const r = await API.exportToSheets({ generate_email: true });
      window.dispatchEvent(new CustomEvent('le-toast', { detail: { kind: 'success', icon: 'check', text: `${r.exported} leads exported to Sheets` } }));
      if (r.url) setSheetsUrl(r.url);
    } catch (e) {
      window.dispatchEvent(new CustomEvent('le-toast', { detail: { kind: 'error', icon: 'info', text: e.message || 'Export failed' } }));
    } finally {
      setSheetsExporting(false);
    }
  };

  const connectGmail = async () => {
    try {
      const res = await fetch('/api/gmail/auth');
      const r = await res.json();
      if (!res.ok) {
        window.dispatchEvent(new CustomEvent('le-toast', { detail: { kind: 'error', icon: 'info', text: r.detail || 'Gmail auth failed' } }));
        return;
      }
      if (r.auth_url) {
        const popup = window.open(r.auth_url, '_blank', 'width=500,height=600');
        const handler = (e) => {
          if (e.data === 'gmail_auth_ok') {
            setGmailConnected(true);
            window.removeEventListener('message', handler);
            popup && popup.close();
            window.dispatchEvent(new CustomEvent('le-toast', { detail: { kind: 'success', icon: 'check', text: 'Gmail connected.' } }));
          }
        };
        window.addEventListener('message', handler);
      }
    } catch (e) {
      window.dispatchEvent(new CustomEvent('le-toast', { detail: { kind: 'error', icon: 'info', text: 'Could not reach server' } }));
    }
  };

  const integrations = [
    { name: 'HubSpot CRM', desc: 'Two-way sync of contacts and deals',   icon: 'building', color: '#d97706', bg: 'var(--amber-bg)',   on: false },
    { name: 'Slack',       desc: 'Post replies and pipeline events',     icon: 'sparkle',  color: '#7c3aed', bg: 'var(--purple-bg)', on: false },
    { name: 'LinkedIn',    desc: 'Beta — enrich profiles automatically', icon: 'linkedin', color: '#0369a1', bg: 'var(--sky-bg)',    on: false },
  ];

  return (
    <React.Fragment>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="sub">Workspace configuration</div>
        </div>
        {section === 'account' && (
          <div className="page-head-actions">
            <button className="btn btn-primary" onClick={handleSaveAccount} disabled={saving}>
              <Icon name="check" size={14} /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}
        {section === 'signature' && (
          <div className="page-head-actions">
            <button className="btn btn-primary" onClick={handleSaveSignature} disabled={sigSaving}>
              <Icon name="check" size={14} /> {sigSaving ? 'Saving…' : 'Save signature'}
            </button>
          </div>
        )}
      </div>

      <div className="settings-grid">
        <nav className="settings-nav">
          {nav.map(n => (
            <button
              key={n.id}
              className={section === n.id ? 'active' : ''}
              onClick={() => setSection(n.id)}
            >
              <Icon name={n.icon} size={14} /> {n.label}
            </button>
          ))}
        </nav>

        <div>
          {section === 'account' && (
            <div className="card">
              <div className="card-head"><h3>Account</h3></div>
              <div className="card-body">
                <div className="settings-row">
                  <div className="info"><b>Name</b><span>Display name on outbound emails</span></div>
                  <div className="control">
                    <input
                      className="field-input"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                      style={{ height: 36, padding: '0 11px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)' }}
                    />
                  </div>
                </div>
                <div className="settings-row">
                  <div className="info"><b>Sender email</b><span>Gmail address used for sending outreach</span></div>
                  <div className="control">
                    <input
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@gmail.com"
                      style={{ height: 36, padding: '0 11px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)' }}
                    />
                  </div>
                </div>
                <div className="settings-row" style={{ borderBottom: 'none' }}>
                  <div className="info"><b>Timezone</b><span>All schedules and reports use this</span></div>
                  <div className="control">
                    <select
                      value={tz}
                      onChange={e => setTz(e.target.value)}
                      style={{ height: 36, padding: '0 11px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)' }}
                    >
                      <option value="Europe/Rome">Europe/Rome</option>
                      <option value="Europe/London">Europe/London</option>
                      <option value="America/New_York">America/New_York</option>
                      <option value="America/Los_Angeles">America/Los_Angeles</option>
                      <option value="Asia/Tokyo">Asia/Tokyo</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {section === 'signature' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
              {/* Editor */}
              <div className="card">
                <div className="card-head">
                  <h3>Email signature</h3>
                  <div className="sub">Appended to every outreach email</div>
                </div>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  <div className="field" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Logo</label>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                      {sig.logo_url && !logoPreviewError
                        ? <img src={sig.logo_url} alt="logo" height="36"
                            style={{ borderRadius: 6, border: '1px solid var(--border)', padding: 4, background: '#fff', maxWidth: 120, objectFit: 'contain' }}
                            onError={() => setLogoPreviewError(true)} />
                        : <div style={{ width: 48, height: 36, borderRadius: 6, border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="building" size={16} style={{ color: 'var(--ink-3)' }} />
                          </div>
                      }
                      <div style={{ flex: 1 }}>
                        <input
                          type="text"
                          value={sig.logo_url}
                          onChange={e => { setSig(s => ({ ...s, logo_url: e.target.value })); setLogoPreviewError(false); }}
                          placeholder="https://yoursite.com/logo.png"
                          style={{ width: '100%', boxSizing: 'border-box', height: 34, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)', fontSize: 13 }}
                        />
                        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>Public image URL — shown in HTML emails only</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ height: 1, background: 'var(--border)' }} />

                  {[
                    { key: 'name',    label: 'Full name',    placeholder: 'Ashkan Dorkian' },
                    { key: 'title',   label: 'Job title',    placeholder: 'Founder & CEO' },
                    { key: 'company', label: 'Company',      placeholder: 'Acme Corp' },
                    { key: 'website', label: 'Website',      placeholder: 'https://acme.com' },
                    { key: 'phone',   label: 'Phone',        placeholder: '+39 333 000 0000' },
                  ].map(f => (
                    <div key={f.key} className="field" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>{f.label}</label>
                      <input
                        type="text"
                        value={sig[f.key]}
                        onChange={e => setSig(s => ({ ...s, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        style={{ width: '100%', boxSizing: 'border-box', height: 36, padding: '0 11px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)', fontSize: 13 }}
                      />
                    </div>
                  ))}

                </div>
              </div>

              {/* Live preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="card">
                  <div className="card-head"><h3>Preview</h3><div className="sub">How it looks in the email</div></div>
                  <div className="card-body">
                    {/* Simulated email body */}
                    <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7, marginBottom: 16, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ color: 'var(--ink-3)', fontSize: 12, marginBottom: 8 }}>Hi {'{'}<span style={{ color: 'var(--teal)' }}>Name</span>{'}'}, …</div>
                      <div>Looking forward to connecting with you and your team at <em>{'{'}<span style={{ color: 'var(--teal)' }}>Company</span>{'}'}</em>…</div>
                    </div>

                    {/* Signature block */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, fontFamily: 'Arial, sans-serif', fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                      {sig.logo_url && !logoPreviewError && (
                        <img src={sig.logo_url} height="36" alt="logo"
                          style={{ marginBottom: 10, display: 'block', maxWidth: 140, objectFit: 'contain' }}
                          onError={() => setLogoPreviewError(true)} />
                      )}
                      {!sig.logo_url && (
                        <div style={{ width: 80, height: 28, borderRadius: 4, background: 'var(--surface-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>Your logo</span>
                        </div>
                      )}
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{sig.name || 'Your Name'}</div>
                      {(sig.title || sig.company) && (
                        <div style={{ color: '#374151' }}>
                          {sig.title}{sig.title && sig.company ? <span style={{ color: '#9ca3af' }}> · </span> : ''}{sig.company}
                        </div>
                      )}
                      {sig.website && (
                        <div><a href={sig.website} style={{ color: '#01696f', textDecoration: 'none' }}>{sig.website.replace(/^https?:\/\//, '')}</a></div>
                      )}
                      {sig.phone && (
                        <div style={{ color: '#6b7280' }}>{sig.phone}</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="card" style={{ background: 'var(--surface-muted)', border: 'none' }}>
                  <div className="card-body" style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6 }}>
                      <Icon name="info" size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                      The signature is embedded at the bottom of every email sent via the Outreach wizard. Plain-text emails include a text version; HTML emails show your logo.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {section === 'appearance' && (
            <div className="card">
              <div className="card-head"><h3>Appearance</h3></div>
              <div className="card-body">
                <div className="settings-row">
                  <div className="info"><b>Theme</b><span>Choose how LeadEngine looks. System matches your OS setting.</span></div>
                  <div className="control">
                    <div className="theme-options">
                      {['light', 'dark', 'system'].map(t => (
                        <div key={t} className={`theme-tile ${t} ${theme === t ? 'on' : ''}`} onClick={() => onTheme(t)}>
                          <div className="preview">
                            <div className="sb" />
                            <div className="main" />
                          </div>
                          <div className="label">{t[0].toUpperCase() + t.slice(1)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="info"><b>Accent color</b><span>Used for badges, charts, and the active nav indicator</span></div>
                  <div className="control" style={{ flexDirection: 'row', gap: 8 }}>
                    {['#01696f', '#7c3aed', '#0284c7', '#db2777', '#d97706'].map((c, i) => (
                      <button key={i} title={c} style={{
                        width: 28, height: 28, borderRadius: '50%', background: c,
                        border: c === '#01696f' ? '3px solid var(--bg)' : '0',
                        boxShadow: c === '#01696f' ? '0 0 0 2px var(--teal)' : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                        cursor: 'pointer',
                      }} />
                    ))}
                  </div>
                </div>
                <div className="settings-row" style={{ borderBottom: 'none' }}>
                  <div className="info"><b>Reduce motion</b><span>Minimize animations and transitions</span></div>
                  <div className="control">
                    <button type="button" className="toggle"><span className="toggle-track" /></button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {section === 'notifications' && (
            <div className="card">
              <div className="card-head"><h3>Notifications</h3></div>
              <div className="card-body">
                {[
                  { key: 'replies',   label: 'New replies',          desc: 'In-app alert when a prospect replies'       },
                  { key: 'qualified', label: 'Newly qualified leads', desc: 'When the AI scores a lead ≥ 7'         },
                  { key: 'daily',     label: 'Daily summary',        desc: 'Recap of yesterday’s pipeline at 8am'  },
                  { key: 'weekly',    label: 'Weekly report',        desc: 'Pipeline metrics every Monday'              },
                  { key: 'mentions',  label: 'Pipeline errors',      desc: 'Alert when a pipeline run fails'            },
                ].map((item, idx, arr) => (
                  <div className="settings-row" key={item.key} style={{ borderBottom: idx === arr.length - 1 ? 'none' : '' }}>
                    <div className="info"><b>{item.label}</b><span>{item.desc}</span></div>
                    <div className="control">
                      <button
                        type="button"
                        className={`toggle ${notif[item.key] ? 'on' : ''}`}
                        onClick={() => setNotif(n => ({ ...n, [item.key]: !n[item.key] }))}
                      >
                        <span className="toggle-track" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === 'integrations' && (
            <div className="card">
              <div className="card-head"><h3>Integrations</h3></div>
              <div className="card-body">
                <div className="settings-row">
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 9, background: '#fce7e7', color: '#c0392b', display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700 }}>G</div>
                    <div className="info">
                      <b>Gmail</b>
                      <span>Send outreach and sync replies from your inbox</span>
                    </div>
                  </div>
                  <div className="control" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {gmailConnected === null && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Checking…</span>}
                    {gmailConnected === true && (
                      <React.Fragment>
                        <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>● Connected</span>
                        <button className="btn" onClick={connectGmail}>Reconnect</button>
                      </React.Fragment>
                    )}
                    {gmailConnected === false && (
                      <button className="btn btn-primary" onClick={connectGmail}>Connect</button>
                    )}
                  </div>
                </div>
                <div className="settings-row">
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--emerald-bg)', color: '#059669', display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700 }}>S</div>
                    <div className="info">
                      <b>Google Sheets</b>
                      <span>Export leads + AI email drafts — pick up in n8n to send via Gmail</span>
                    </div>
                  </div>
                  <div className="control" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {sheetsConfigured === null && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Checking…</span>}
                    {sheetsConfigured === false && (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {gmailConnected ? 'Set GOOGLE_SHEET_ID in .env' : 'Connect Gmail first, then set GOOGLE_SHEET_ID in .env'}
                      </span>
                    )}
                    {sheetsConfigured === true && (
                      <React.Fragment>
                        <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>● Configured</span>
                        {sheetsUrl && (
                          <a href={sheetsUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--teal)' }}>Open sheet ↗</a>
                        )}
                        <button className="btn btn-primary" onClick={exportSheets} disabled={sheetsExporting}>
                          {sheetsExporting ? <React.Fragment><span className="cursor-rot" /> Exporting…</React.Fragment> : <React.Fragment><Icon name="download" size={13} /> Export leads</React.Fragment>}
                        </button>
                      </React.Fragment>
                    )}
                  </div>
                </div>

                {integrations.map((it, i) => (
                  <div key={i} className="settings-row" style={{ borderBottom: i === integrations.length - 1 ? 'none' : '' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 9, background: it.bg, color: it.color, display: 'grid', placeItems: 'center' }}>
                        <Icon name={it.icon} size={18} />
                      </div>
                      <div className="info">
                        <b>{it.name}</b>
                        <span>{it.desc}</span>
                      </div>
                    </div>
                    <div className="control" style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <button className="btn">Connect</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === 'api' && (
            <div className="card">
              <div className="card-head"><h3>API & Webhooks</h3></div>
              <div className="card-body">
                <div className="settings-row">
                  <div className="info"><b>Base URL</b><span>LeadEngine REST API endpoint</span></div>
                  <div className="control">
                    <input readOnly value={window.location.origin + '/api'} style={{ flex: 1, height: 36, padding: '0 11px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface-muted)', color: 'var(--ink-2)', fontFamily: 'Geist Mono, monospace', fontSize: 12 }} />
                  </div>
                </div>
                <div className="settings-row" style={{ borderBottom: 'none' }}>
                  <div className="info"><b>Webhook endpoint</b><span>POST events here when leads are qualified or reply</span></div>
                  <div className="control">
                    <input placeholder="https://api.yourapp.com/leadengine/webhook" style={{ height: 36, padding: '0 11px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)' }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </React.Fragment>
  );
}

window.SettingsScreen = SettingsScreen;
