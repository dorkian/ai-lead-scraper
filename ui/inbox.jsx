// Inbox — sent emails and reply tracking
function InboxScreen() {
  const [emails, setEmails] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [activeId, setActiveId] = React.useState(null);
  const [syncing, setSyncing] = React.useState(false);
  const [syncMsg, setSyncMsg] = React.useState('');
  const [gmailConnected, setGmailConnected] = React.useState(null);
  const [filter, setFilter] = React.useState('all');

  const load = () =>
    API.getEmails()
      .then(rows => {
        if (rows && rows.length) {
          setEmails(rows);
          setActiveId(rows[0].id);
        } else {
          setEmails([]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

  React.useEffect(() => {
    load();
    fetch('/api/gmail/status')
      .then(r => r.json())
      .then(d => setGmailConnected(d.authenticated))
      .catch(() => setGmailConnected(false));
  }, []);

  const syncReplies = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const r = await fetch('/api/emails/sync', { method: 'POST' }).then(r => r.json());
      setSyncMsg(`Checked ${r.synced} emails — ${r.new_replies} new repl${r.new_replies === 1 ? 'y' : 'ies'}`);
      if (r.new_replies > 0) load();
    } catch (e) {
      setSyncMsg('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const markReplied = async (emailId) => {
    await fetch(`/api/emails/${emailId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replied: true, reply_snippet: 'Marked manually' }),
    });
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, replied: 1, reply_snippet: 'Marked manually' } : e));
  };

  if (loading) return <div className="empty">Loading inbox…</div>;

  const filtered = filter === 'replied'
    ? emails.filter(e => e.replied)
    : filter === 'pending'
    ? emails.filter(e => !e.replied)
    : emails;

  const active = filtered.find(e => e.id === activeId) || filtered[0];

  return (
    <React.Fragment>
      <div className="page-head">
        <div>
          <h1>Inbox</h1>
          <div className="sub">{emails.length} email{emails.length !== 1 ? 's' : ''} sent · {emails.filter(e => e.replied).length} replies</div>
        </div>
        <div className="page-head-actions">
          {gmailConnected === true && (
            <button className="btn" onClick={syncReplies} disabled={syncing}>
              <Icon name="refresh" size={14} /> {syncing ? 'Syncing…' : 'Sync Replies'}
            </button>
          )}
        </div>
      </div>

      {gmailConnected === false && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
          <span style={{ color: 'var(--muted)' }}>Gmail not connected — reply sync is disabled.</span>
          <a href="#" onClick={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('le-navigate', { detail: 'settings' })); }} style={{ color: 'var(--teal)', fontWeight: 500 }}>Connect in Settings →</a>
        </div>
      )}

      {syncMsg && (
        <div className="alert-info" style={{ margin: '0 0 12px', padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
          {syncMsg}
        </div>
      )}

      {emails.length === 0 ? (
        <div className="empty" style={{ padding: '80px 20px' }}>
          No emails sent yet — run the pipeline with dry-run off to send outreach.
        </div>
      ) : (
        <div className="inbox-grid">
          <div className="inbox-list">
            <div className="card">
              <div className="tabs" style={{ padding: '0 12px' }}>
                <button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                  All <span className="count">{emails.length}</span>
                </button>
                <button className={`tab ${filter === 'replied' ? 'active' : ''}`} onClick={() => setFilter('replied')}>
                  Replied <span className="count">{emails.filter(e => e.replied).length}</span>
                </button>
                <button className={`tab ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>
                  Pending <span className="count">{emails.filter(e => !e.replied).length}</span>
                </button>
              </div>
              <div className="inbox-list-body">
                {filtered.length === 0 && (
                  <div style={{ padding: '24px 16px', color: 'var(--muted)', fontSize: 13 }}>No emails in this view.</div>
                )}
                {filtered.map(e => {
                  const initials = (e.company || e.subject || 'E').slice(0, 2).toUpperCase();
                  const date = e.sent_at
                    ? new Date(e.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '—';
                  const preview = (e.body || '').replace(/\n+/g, ' ').slice(0, 80);
                  return (
                    <button
                      key={e.id}
                      className={`inbox-row ${e.id === activeId ? 'active' : ''}`}
                      onClick={() => setActiveId(e.id)}
                    >
                      <div className="avatar" style={{ background: e.replied ? '#01696f' : '#555' }}>{initials}</div>
                      <div className="meta">
                        <div className="top-row">
                          <span className="from">{e.company || `Lead #${e.lead_id}`}</span>
                          <span className="time">{date}</span>
                        </div>
                        <div className="subject">{e.subject || '(no subject)'}</div>
                        <div className="preview">{preview}{preview.length >= 80 ? '…' : ''}</div>
                        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                          <span className="badge status emailed">sent</span>
                          {e.replied ? <span className="badge status replied" style={{ background: '#01696f22', color: '#01696f' }}>replied</span> : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card inbox-thread">
            {active && (
              <React.Fragment>
                <div className="thread-head">
                  <div className="avatar" style={{ background: '#01696f', width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 600, fontSize: 13 }}>
                    {(active.company || active.subject || 'E').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="subj">{active.subject || '(no subject)'}</div>
                    <div className="meta">{active.lead_email || `Lead #${active.lead_id}`}</div>
                  </div>
                  <div className="thread-actions">
                    {!active.replied && (
                      <button className="btn" onClick={() => markReplied(active.id)}>
                        <Icon name="check" size={13} /> Mark replied
                      </button>
                    )}
                    <button className="btn btn-icon"><Icon name="more" size={14} /></button>
                  </div>
                </div>
                <div className="thread-body">
                  <div>
                    <div className="msg-from">
                      <b>You</b>
                      <span>{active.sent_at ? new Date(active.sent_at).toLocaleString() : ''}</span>
                    </div>
                    <div className="msg-bubble mine" style={{ whiteSpace: 'pre-wrap' }}>{active.body}</div>
                  </div>

                  {active.replied && active.reply_snippet && (
                    <div style={{ marginTop: 16 }}>
                      <div className="msg-from">
                        <b>{active.lead_email || 'Lead'}</b>
                        <span>{active.reply_at ? new Date(active.reply_at).toLocaleString() : 'replied'}</span>
                      </div>
                      <div className="msg-bubble" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', whiteSpace: 'pre-wrap', fontSize: 13 }}>
                        {active.reply_snippet}
                      </div>
                    </div>
                  )}

                  {!active.replied && (
                    <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="chip"><Icon name="sparkle" size={12} /> Draft a follow-up with AI</button>
                      <button className="chip" onClick={() => markReplied(active.id)}><Icon name="check" size={12} /> Mark as replied</button>
                    </div>
                  )}
                </div>
              </React.Fragment>
            )}
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

window.InboxScreen = InboxScreen;
