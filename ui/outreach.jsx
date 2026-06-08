// Outreach — 4-step email wizard
function OutreachScreen() {
  const [step, setStep] = React.useState(0);
  const [campaigns, setCampaigns] = React.useState([]);
  const [selectedCampaign, setSelectedCampaign] = React.useState(null);
  const [leads, setLeads] = React.useState([]);
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [checkedLeadIds, setCheckedLeadIds] = React.useState(new Set());
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [generating, setGenerating] = React.useState(false);
  const [historyLead, setHistoryLead] = React.useState(null);
  const [historyItems, setHistoryItems] = React.useState([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [sendResults, setSendResults] = React.useState([]);
  const [sending, setSending] = React.useState(false);
  const [sendDone, setSendDone] = React.useState(false);

  React.useEffect(() => {
    API.getCampaigns().then(cs => {
      setCampaigns(cs);
      // Handle pre-selection from le-outreach event that fired before campaigns loaded
      const pending = window._leOutreachPendingId;
      if (pending) {
        const found = cs.find(c => c.id === pending);
        if (found) { setSelectedCampaign(found); setStep(1); }
        window._leOutreachPendingId = null;
      }
    }).catch(() => {});
    API.getLeads().then(ls => setLeads(ls)).catch(() => {});
  }, []);

  React.useEffect(() => {
    function handleOutreachEvent(e) {
      const campaignId = e.detail;
      setCampaigns(cs => {
        const found = cs.find(c => c.id === campaignId);
        if (found) { setSelectedCampaign(found); setStep(1); }
        else { window._leOutreachPendingId = campaignId; }
        return cs;
      });
    }
    window.addEventListener('le-outreach', handleOutreachEvent);
    return () => window.removeEventListener('le-outreach', handleOutreachEvent);
  }, []);

  React.useEffect(() => {
    if (step === 2 && checkedLeadIds.size > 0 && selectedCampaign) {
      generatePreview();
    }
  }, [step]);

  function generatePreview() {
    const firstId = [...checkedLeadIds][0];
    setGenerating(true);
    fetch('/api/outreach/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: selectedCampaign.id, lead_id: firstId }),
    })
      .then(r => r.json())
      .then(d => {
        setSubject(d.subject || '');
        setBody(d.body || '');
      })
      .catch(() => {})
      .finally(() => setGenerating(false));
  }

  function openHistory(lead) {
    setHistoryLead(lead);
    setHistoryItems([]);
    setHistoryLoading(true);
    fetch(`/api/leads/${lead.id}/history`)
      .then(r => r.json())
      .then(d => setHistoryItems(Array.isArray(d) ? d : []))
      .catch(() => setHistoryItems([]))
      .finally(() => setHistoryLoading(false));
  }

  function handleSend() {
    setSending(true);
    setSendResults([]);
    fetch('/api/outreach/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: selectedCampaign.id,
        lead_ids: [...checkedLeadIds],
        subject,
        body,
      }),
    })
      .then(r => r.json())
      .then(d => {
        setSendResults(Array.isArray(d.results) ? d.results : []);
        setSendDone(true);
        window.dispatchEvent(new CustomEvent('le-toast', {
          detail: { kind: 'success', icon: 'check', text: `Sent ${d.sent || 0}, failed ${d.failed || 0}.` },
        }));
      })
      .catch(() => {
        window.dispatchEvent(new CustomEvent('le-toast', {
          detail: { kind: 'info', icon: 'info', text: 'Send failed — check server logs.' },
        }));
      })
      .finally(() => setSending(false));
  }

  const filteredLeads = statusFilter === 'all'
    ? leads
    : leads.filter(l => (l.status || 'new') === statusFilter);

  const statusCounts = React.useMemo(() => {
    const c = { all: leads.length, new: 0, qualified: 0, emailed: 0, replied: 0 };
    leads.forEach(l => {
      const s = l.status || 'new';
      if (c[s] !== undefined) c[s]++;
    });
    return c;
  }, [leads]);

  const checkedLeads = leads.filter(l => checkedLeadIds.has(l.id));
  const firstLead = checkedLeads[0] || null;

  const sig = selectedCampaign && selectedCampaign.config && selectedCampaign.config.signature
    ? selectedCampaign.config.signature
    : {};

  const STEPS = ['Campaign', 'Leads', 'Message', 'Review'];

  function canNext() {
    if (step === 0) return !!selectedCampaign;
    if (step === 1) return checkedLeadIds.size > 0;
    if (step === 2) return subject.trim().length > 0;
    return false;
  }

  function renderStepIndicator() {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
        {STEPS.map((label, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <div style={{
                width: 32, height: 1,
                background: i <= step ? 'var(--teal)' : 'var(--border)',
              }} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600,
                background: i < step ? 'var(--teal)' : i === step ? 'var(--teal)' : 'var(--surface-muted)',
                color: i <= step ? '#fff' : 'var(--ink-3)',
                border: i === step ? '2px solid var(--teal)' : '2px solid transparent',
                boxSizing: 'border-box',
              }}>
                {i < step ? <Icon name="check" size={12} /> : i + 1}
              </div>
              <div style={{ fontSize: 11, color: i === step ? 'var(--teal)' : 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                {label}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
    );
  }

  function renderStep0() {
    return (
      <div>
        <p style={{ marginBottom: 16, color: 'var(--ink-3)', fontSize: 13 }}>
          Select a campaign to send emails for, then click <strong>Next</strong>.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {campaigns.map(c => {
            const cfg = c.config || {};
            const t = cfg.target || {};
            const pp = Array.isArray(t.pain_points) ? t.pain_points : [];
            const active = selectedCampaign && selectedCampaign.id === c.id;
            return (
              <div
                key={c.id}
                className="card"
                onClick={() => setSelectedCampaign(c)}
                style={{
                  cursor: 'pointer',
                  outline: active ? '2px solid var(--teal)' : '2px solid var(--border)',
                  outlineOffset: -2,
                  transition: 'outline 0.12s, box-shadow 0.12s',
                  boxShadow: active ? '0 0 0 4px var(--teal-50)' : 'none',
                  background: active ? 'var(--teal-50)' : 'var(--surface)',
                }}
              >
                <div className="card-head">
                  <h3 style={{ marginBottom: 2, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</h3>
                  {active
                    ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0 }}><Icon name="check" size={11} style={{ color: '#fff' }} /></span>
                    : <span style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--border)', flexShrink: 0, display: 'inline-block' }} />
                  }
                </div>
                <div className="card-body" style={{ fontSize: 13, color: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {t.role && <div><span className="muted">Role: </span>{t.role}</div>}
                  {t.industry && <div><span className="muted">Industry: </span>{t.industry}</div>}
                  {pp.length > 0 && (
                    <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {pp.slice(0, 3).map((p, i) => (
                        <span key={i} className="badge" style={{ fontSize: 11 }}>{p}</span>
                      ))}
                      {pp.length > 3 && <span className="badge" style={{ fontSize: 11 }}>+{pp.length - 3}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {campaigns.length === 0 && (
            <div className="empty" style={{ gridColumn: '1 / -1' }}>
              No campaigns yet — go to Configure to create one.
            </div>
          )}
        </div>
        {selectedCampaign && (
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)' }} />
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              <strong>{selectedCampaign.name}</strong> selected — click <strong>Next</strong> to pick leads.
            </span>
          </div>
        )}
      </div>
    );
  }

  function renderStep1() {
    const filters = ['all', 'new', 'qualified', 'emailed', 'replied'];
    const allVisible = filteredLeads.every(l => checkedLeadIds.has(l.id));

    function toggleAll() {
      if (allVisible && filteredLeads.length > 0) {
        setCheckedLeadIds(ids => {
          const next = new Set(ids);
          filteredLeads.forEach(l => next.delete(l.id));
          return next;
        });
      } else {
        setCheckedLeadIds(ids => {
          const next = new Set(ids);
          filteredLeads.forEach(l => next.add(l.id));
          return next;
        });
      }
    }

    function toggleLead(id) {
      setCheckedLeadIds(ids => {
        const next = new Set(ids);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }

    return (
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {filters.map(f => (
            <button
              key={f}
              className={`btn ${statusFilter === f ? 'btn-primary' : ''}`}
              style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={() => setStatusFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              <span style={{ marginLeft: 5, opacity: 0.7 }}>({statusCounts[f] || 0})</span>
            </button>
          ))}
        </div>

        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 14px', width: 36 }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={allVisible && filteredLeads.length > 0} onChange={toggleAll} />
                  </th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Company</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Email</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Score</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Last sent</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map(l => {
                  const checked = checkedLeadIds.has(l.id);
                  const raw = l.raw_data || {};
                  const lastSent = raw.last_sent || l.last_sent || null;
                  const status = l.status || 'new';
                  return (
                    <tr
                      key={l.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: checked ? 'var(--teal-50)' : 'transparent',
                        cursor: 'pointer',
                      }}
                      onClick={() => openHistory(l)}
                    >
                      <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={checked} onChange={() => toggleLead(l.id)} />
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 500 }}>{l.company || '—'}</div>
                        {l.domain && <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{l.domain}</div>}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--ink-2)' }}>{l.email || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span className={`badge status ${status}`}>{status}</span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {l.iq_score != null ? (
                          <span className="badge" style={{ fontVariantNumeric: 'tabular-nums' }}>{l.iq_score}</span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--ink-3)', fontSize: 12 }}>
                        {lastSent ? new Date(lastSent).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  );
                })}
                {filteredLeads.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>
                      No leads for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--ink-3)' }}>
          {checkedLeadIds.size > 0
            ? `${checkedLeadIds.size} lead${checkedLeadIds.size !== 1 ? 's' : ''} selected`
            : 'Select leads to include in this send'}
        </div>

        {historyLead && (
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
              zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={() => setHistoryLead(null)}
          >
            <div
              className="card"
              style={{ width: 520, maxHeight: '70vh', display: 'flex', flexDirection: 'column', margin: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="card-head" style={{ justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <h3>Email history</h3>
                  <div className="sub">{historyLead.company || historyLead.email}</div>
                </div>
                <button className="btn btn-icon" onClick={() => setHistoryLead(null)}>
                  <Icon name="x" size={14} />
                </button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px 16px' }}>
                {historyLoading && <div className="muted" style={{ padding: 24, textAlign: 'center' }}>Loading…</div>}
                {!historyLoading && historyItems.length === 0 && (
                  <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No emails sent yet.</div>
                )}
                {!historyLoading && historyItems.map((item, i) => (
                  <div key={i} style={{
                    borderBottom: '1px solid var(--border)', padding: '12px 0',
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{item.subject || '(no subject)'}</span>
                      {item.replied && <span className="badge status qualified" style={{ fontSize: 11 }}>Replied</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                      {item.sent_at ? new Date(item.sent_at).toLocaleString() : item.date || ''}
                    </div>
                    {item.preview && (
                      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>{item.preview}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderStep2() {
    const sigName = sig.name || (selectedCampaign && selectedCampaign.config && selectedCampaign.config.outreach && selectedCampaign.config.outreach.sender_name) || '';
    return (
      <div>
        <div className="card">
          <div className="card-head">
            <h3>Message</h3>
            <div className="sub">Customize before sending — use {'{name}'} and {'{company}'} as tokens</div>
          </div>
          <div className="card-body">
            <div className="field">
              <label>Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
                disabled={generating}
              />
            </div>
            <div className="field">
              <label>Body</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={12}
                style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}
                disabled={generating}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn" onClick={generatePreview} disabled={generating}>
                {generating
                  ? <React.Fragment><span className="cursor-rot" /> Generating…</React.Fragment>
                  : <React.Fragment><Icon name="sparkle" size={13} /> Regenerate with AI</React.Fragment>}
              </button>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                Use <code>{'{name}'}</code> and <code>{'{company}'}</code> — replaced per recipient
              </span>
            </div>

            <div className="divider" style={{ margin: '18px 0 12px' }} />
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              <div style={{ marginBottom: 6, fontWeight: 500, color: 'var(--ink-2)' }}>Signature preview</div>
              <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12, lineHeight: 1.7 }}>
                <div style={{ color: 'var(--ink-3)', marginBottom: 4 }}>-- </div>
                {sig.logo_url && (
                  <img src={sig.logo_url} height="32" style={{ marginBottom: 6, display: 'block' }} alt="logo" />
                )}
                <strong style={{ color: 'var(--ink-2)' }}>{sigName || 'Your Name'}</strong>
                {(sig.title || sig.company) && (
                  <div>{sig.title}{sig.title && sig.company ? ' · ' : ''}{sig.company}</div>
                )}
                {(sig.website || sig.phone) && (
                  <div>{sig.website}{sig.website && sig.phone ? ' | ' : ''}{sig.phone}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderStep3() {
    const sigName = sig.name || (selectedCampaign && selectedCampaign.config && selectedCampaign.config.outreach && selectedCampaign.config.outreach.sender_name) || '';
    const previewSubject = subject;
    const previewBody = firstLead
      ? body
          .replace(/\{name\}/gi, firstLead.name || firstLead.contact_name || 'there')
          .replace(/\{company\}/gi, firstLead.company || 'your company')
      : body;

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <h3>Recipients ({checkedLeads.length})</h3>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {checkedLeads.map(l => {
              const result = sendResults.find(r => r.lead_id === l.id);
              const initials = (l.company || l.email || '?').slice(0, 2).toUpperCase();
              const status = l.status || 'new';
              return (
                <div key={l.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px', borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'var(--teal-50)', color: 'var(--teal)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600, flexShrink: 0,
                  }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.company || '—'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.email || '—'}
                    </div>
                  </div>
                  <span className={`badge status ${status}`} style={{ fontSize: 11, flexShrink: 0 }}>{status}</span>
                  {result && (
                    <span style={{
                      fontSize: 16, fontWeight: 700, flexShrink: 0,
                      color: result.status === 'sent' ? 'var(--teal)' : '#ef4444',
                    }}>
                      {result.status === 'sent' ? '✓' : '✗'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Message preview</h3>
          </div>
          <div className="card-body" style={{ fontSize: 13, lineHeight: 1.7 }}>
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>{previewSubject || '(no subject)'}</div>
            <div style={{ color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{previewBody}</div>
            <div className="divider" style={{ margin: '14px 0 10px' }} />
            <div style={{ color: 'var(--ink-3)', lineHeight: 1.7 }}>
              <div>-- </div>
              {sig.logo_url && (
                <img src={sig.logo_url} height="28" style={{ marginBottom: 4, display: 'block' }} alt="logo" />
              )}
              <strong style={{ color: 'var(--ink-2)' }}>{sigName || 'Your Name'}</strong>
              {(sig.title || sig.company) && (
                <div>{sig.title}{sig.title && sig.company ? ' · ' : ''}{sig.company}</div>
              )}
              {(sig.website || sig.phone) && (
                <div>{sig.website}{sig.website && sig.phone ? ' | ' : ''}{sig.phone}</div>
              )}
            </div>
          </div>
          {!sendDone && (
            <div style={{ padding: '0 16px 16px' }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%', padding: '10px', fontSize: 14 }}
                onClick={handleSend}
                disabled={sending || checkedLeads.length === 0}
              >
                {sending
                  ? <React.Fragment><span className="cursor-rot" /> Sending…</React.Fragment>
                  : <React.Fragment><Icon name="send" size={14} /> Send to {checkedLeads.length} lead{checkedLeads.length !== 1 ? 's' : ''}</React.Fragment>}
              </button>
            </div>
          )}
          {sendDone && (
            <div style={{ padding: '0 16px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="badge status qualified" style={{ fontSize: 13, padding: '6px 14px' }}>
                <Icon name="check" size={13} /> Sent
              </span>
              <button className="btn" onClick={() => window.dispatchEvent(new CustomEvent('le-navigate', { detail: 'inbox' }))}>
                View in Inbox →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <React.Fragment>
      <div className="page-head">
        <div>
          <h1>Outreach</h1>
          <div className="sub">Send personalized emails to your leads in 4 steps.</div>
        </div>
        <div className="page-head-actions" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {renderStepIndicator()}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              Back
            </button>
            {step < 3 ? (
              <button
                className="btn btn-primary"
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext()}
              >
                Next
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleSend}
                disabled={sending || checkedLeads.length === 0 || sendDone}
              >
                {sending
                  ? <React.Fragment><span className="cursor-rot" /> Sending…</React.Fragment>
                  : `Send to ${checkedLeads.length}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {step === 0 && renderStep0()}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
    </React.Fragment>
  );
}

window.OutreachScreen = OutreachScreen;
