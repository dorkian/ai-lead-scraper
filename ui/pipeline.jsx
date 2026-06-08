// Run Pipeline screen — wired to POST /api/run + SSE /api/run/status
function PipelineScreen() {
  const [campaigns, setCampaigns] = React.useState([]);
  const [campaignId, setCampaignId] = React.useState(null);
  const [source, setSource] = React.useState('gmaps');
  const [limit, setLimit] = React.useState(20);
  const [dryRun, setDryRun] = React.useState(true);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    API.getCampaigns().then(cs => {
      setCampaigns(cs);
      if (cs.length > 0) setCampaignId(cs[0].id);
    }).catch(() => {});
  }, []);
  const [done, setDone] = React.useState(false);
  const [lines, setLines] = React.useState([]);
  const termRef = React.useRef(null);
  const stopRef = React.useRef(null);

  React.useEffect(() => {
    return () => { if (stopRef.current) stopRef.current(); };
  }, []);

  React.useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [lines]);

  function sseEventToLine(ev) {
    switch (ev.step) {
      case 'fetch':
        return { level: 'ok', time: now(), parts: [{ t: 'Fetched ' }, { t: String(ev.count), c: 'accent' }, { t: ` from ${ev.source === 'gmaps' ? 'Google Maps' : 'Reddit'}` }] };
      case 'email_find':
        return ev.found
          ? { level: 'ok',  time: now(), parts: [{ t: ev.domain + ' — email found ' }, { t: `(${ev.method || 'scrape'})`, c: 'dim' }] }
          : { level: 'err', time: now(), parts: [{ t: ev.domain + ' — email not found, skipping' }] };
      case 'verify':
        return ev.verified
          ? { level: 'ok',  time: now(), parts: [{ t: ev.email + ' — verified ✓' }] }
          : { level: 'err', time: now(), parts: [{ t: ev.email + ' — SMTP verification failed' }] };
      case 'qualify':
        return { level: ev.score >= 7 ? 'ok' : 'warn', time: now(), parts: [
          { t: ev.company + ' — score ' }, { t: `${ev.score}/10`, c: 'accent' },
          { t: ev.score >= 7 ? ' — qualified' : ' — below threshold', c: 'dim' },
        ]};
      case 'send':
        return ev.status === 'sent'
          ? { level: 'ok',  time: now(), parts: [{ t: 'Sent to ' }, { t: ev.email, c: 'accent' }] }
          : { level: 'warn',time: now(), parts: [{ t: '[DRY RUN] Would send to ' }, { t: ev.email, c: 'accent' }, { t: ` — ${ev.subject || ''}`, c: 'dim' }] };
      case 'done':
        return { level: 'ok', time: now(), parts: [
          { t: 'Pipeline complete · ' },
          { t: `${ev.leads_found} found, ${ev.leads_qualified} qualified, ${ev.emails_sent} sent`, c: 'accent' },
        ]};
      case 'error':
        return { level: 'err', time: now(), parts: [{ t: 'Error: ' + (ev.message || 'unknown') }] };
      default:
        return null;
    }
  }

  function now() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  }

  function pushLine(line) {
    setLines(prev => [...prev, line]);
  }

  const start = () => {
    setRunning(true);
    setDone(false);
    setLines([
      { level: 'info', time: now(), parts: [{ t: 'LeadEngine ' }, { t: 'v1.0', c: 'accent' }, { t: ' · pipeline starting…' }] },
      { level: 'info', time: now(), parts: [{ t: 'mode: ' }, { t: dryRun ? 'DRY-RUN' : 'LIVE', c: 'accent' }, { t: '  ·  source: ' }, { t: source === 'gmaps' ? 'Google Maps' : 'Reddit', c: 'accent' }, { t: '  ·  limit: ' }, { t: String(limit), c: 'accent' }] },
    ]);

    API.startRun({ source, limit, dry_run: dryRun, campaign_id: campaignId })
      .then(() => {
        pushLine({ level: 'ok', time: now(), parts: [{ t: 'Pipeline started on server' }] });
        const stop = API.subscribeRunStatus(
          (ev) => {
            const line = sseEventToLine(ev);
            if (line) pushLine(line);
          },
          (finalEv) => {
            setRunning(false);
            setDone(true);
            stopRef.current = null;
            if (finalEv.step === 'done') {
              window.dispatchEvent(new CustomEvent('le-toast', { detail: {
                kind: 'success', icon: 'check',
                text: `Pipeline done · ${finalEv.leads_found} found, ${finalEv.leads_qualified} qualified, ${finalEv.emails_sent} sent`,
              }}));
            }
          }
        );
        stopRef.current = stop;
      })
      .catch(err => {
        pushLine({ level: 'err', time: now(), parts: [{ t: 'Failed to start: ' + err.message + ' (is the API server running?)' }] });
        setRunning(false);
      });
  };

  const stop = () => {
    if (stopRef.current) { stopRef.current(); stopRef.current = null; }
    setRunning(false);
    pushLine({ level: 'err', time: now(), parts: [{ t: 'aborted by user' }] });
  };

  return (
    <React.Fragment>
      <div className="page-head">
        <div>
          <h1>Run Pipeline</h1>
          <div className="sub">Discover leads, score them with AI, draft outreach.</div>
        </div>
        <div className="page-head-actions">
          <button className="btn"><Icon name="list" size={14} /> Run history</button>
        </div>
      </div>

      <div className="run-grid">
        {/* LEFT — controls */}
        <div className="card">
          <div className="card-head">
            <h3>Run configuration</h3>
          </div>
          <div className="card-body">
            {campaigns.length > 0 && (
              <div className="field">
                <label>Campaign</label>
                <select value={campaignId || ''} onChange={e => setCampaignId(e.target.value)} disabled={running}>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <div className="hint">Which product ICP to use for scoring and email writing</div>
              </div>
            )}
            <div className="field">
              <label>Source</label>
              <div className="source-toggle">
                <button
                  className={`source-card gmaps ${source === 'gmaps' ? 'on' : ''}`}
                  onClick={() => setSource('gmaps')}
                  disabled={running}
                >
                  <div className="ic"><Icon name="map" size={16} /></div>
                  <div className="meta">
                    <b>Google Maps</b>
                    <span>Local businesses by category &amp; geo</span>
                  </div>
                </button>
                <button
                  className={`source-card reddit ${source === 'reddit' ? 'on' : ''}`}
                  onClick={() => setSource('reddit')}
                  disabled={running}
                >
                  <div className="ic"><Icon name="redditc" size={16} /></div>
                  <div className="meta">
                    <b>Reddit</b>
                    <span>Authors of relevant threads</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="field-row">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Limit</label>
                <input type="number" value={limit} min={1} max={200} onChange={e => setLimit(Number(e.target.value))} disabled={running} />
                <div className="hint">Max new leads per run</div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Geography</label>
                <select disabled={running} defaultValue="Italy">
                  <option>Italy</option>
                  <option>Europe</option>
                  <option>US/Canada</option>
                  <option>Worldwide</option>
                </select>
                <div className="hint">{source === 'reddit' ? 'Inferred from subreddit metadata' : 'Maps query region'}</div>
              </div>
            </div>

            <div style={{ height: 18 }} />
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Options</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
                <label className="toggle" style={{ cursor: running ? 'default' : 'pointer' }}>
                  <button
                    type="button"
                    className={`toggle ${dryRun ? 'on' : ''}`}
                    onClick={() => !running && setDryRun(d => !d)}
                  >
                    <span className="toggle-track" />
                  </button>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Dry run</div>
                    <div className="hint">Score and dedupe, but don't send emails</div>
                  </div>
                </label>
                <label className="toggle">
                  <button type="button" className="toggle on"><span className="toggle-track" /></button>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Skip duplicates</div>
                    <div className="hint">Match against existing leads in DB</div>
                  </div>
                </label>
              </div>
            </div>

            <div style={{ height: 18 }} />
            <dl className="run-summary">
              <dt>Source</dt><dd>{source === 'gmaps' ? 'Google Maps' : 'Reddit'}</dd>
              <dt>Target</dt><dd>up to {limit} leads</dd>
              <dt>Mode</dt><dd>{dryRun ? 'Dry run' : 'Live send'}</dd>
              <dt>Estimated time</dt><dd>20–90 sec</dd>
            </dl>

            <div style={{ height: 18 }} />
            {!running ? (
              <button className="btn btn-primary btn-lg btn-block" onClick={start}>
                <Icon name="play" size={14} /> Run now
              </button>
            ) : (
              <button className="btn btn-danger btn-lg btn-block" onClick={stop}>
                <Icon name="x" size={14} /> Stop
              </button>
            )}
            <div className="hint" style={{ marginTop: 10, textAlign: 'center' }}>
              Requires API server running on port 3252
            </div>
          </div>
        </div>

        {/* RIGHT — terminal */}
        <div className="terminal">
          <div className="terminal-head">
            <span className="dot" style={{ background: '#f87171' }} />
            <span className="dot" style={{ background: '#fbbf24' }} />
            <span className="dot" style={{ background: '#4ade80' }} />
            <span className="title mono">leadengine ▸ pipeline.run</span>
            {running && (
              <span className="badge-live"><span className="ping" /> LIVE</span>
            )}
            {done && !running && (
              <span className="badge-live" style={{ color: '#a3a8b6' }}>● completed</span>
            )}
          </div>
          <div className="terminal-body" ref={termRef}>
            {lines.length === 0 && (
              <div className="term-line info">
                <span className="t">—</span>
                <span className="ic"><Icon name="info" size={12} /></span>
                <span className="msg dim">No output yet. Configure your run and press "Run now".</span>
              </div>
            )}
            {lines.map((l, i) => {
              const ic = l.level === 'ok' ? '✓' : l.level === 'err' ? '✗' : l.level === 'warn' ? '!' : '●';
              return (
                <div key={i} className={`term-line ${l.level}`}>
                  <span className="t">{l.time}</span>
                  <span className="ic">{ic}</span>
                  <span className="msg">
                    {l.parts.map((p, j) => (
                      <span key={j} className={p.c || ''}>{p.t}</span>
                    ))}
                  </span>
                </div>
              );
            })}
            {running && (
              <div className="term-line info">
                <span className="t">—</span>
                <span className="ic"><Icon name="spinner" size={11} /></span>
                <span className="msg dim">working<span className="cursor" /></span>
              </div>
            )}
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

window.PipelineScreen = PipelineScreen;
