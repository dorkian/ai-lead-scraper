// Configure — campaign management with AI ICP suggestion
function ConfigureScreen() {
  const [campaigns, setCampaigns] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(null);
  const [product, setProduct] = React.useState({ name: '', description: '', valueProp: '', website: '', pricing: '' });
  const [outreach, setOutreach] = React.useState({ senderName: '', senderEmail: '', dailyLimit: 30, timezone: 'Europe/Rome' });
  const [icp, setIcp] = React.useState({ role: '', industry: '', location: '', size: '', revenue: '$1M – $25M ARR' });
  const [pains, setPains] = React.useState([]);
  const [painDraft, setPainDraft] = React.useState('');
  const [signature, setSignature] = React.useState({ name: '', title: '', company: '', website: '', phone: '', logo_url: '' });
  const [saving, setSaving] = React.useState(false);
  const [suggesting, setSuggesting] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const importFileRef = React.useRef(null);

  React.useEffect(() => {
    API.getCampaigns()
      .then(cs => {
        setCampaigns(cs);
        if (cs.length > 0) loadCampaign(cs[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function loadCampaign(c) {
    setSelectedId(c.id);
    const cfg = c.config || {};
    const p = cfg.product || {};
    const t = cfg.target || {};
    const o = cfg.outreach || {};
    setProduct({
      name:        p.name        || '',
      description: p.description || '',
      valueProp:   p.value_prop  || '',
      website:     p.website     || '',
      pricing:     p.pricing     || '',
    });
    setIcp({
      role:     t.role         || '',
      industry: t.industry     || '',
      location: t.location     || '',
      size:     t.company_size || '',
      revenue:  t.revenue      || '$1M – $25M ARR',
    });
    setOutreach({
      senderName:  o.sender_name  || '',
      senderEmail: o.sender_email || '',
      dailyLimit:  o.daily_limit  || 30,
      timezone:    o.timezone     || 'Europe/Rome',
    });
    setPains(Array.isArray(t.pain_points) ? t.pain_points : []);
    const sig = cfg.signature || {};
    setSignature({
      name:     sig.name     || '',
      title:    sig.title    || '',
      company:  sig.company  || '',
      website:  sig.website  || '',
      phone:    sig.phone    || '',
      logo_url: sig.logo_url || '',
    });
  }

  function buildConfig() {
    return {
      product: {
        name:        product.name,
        description: product.description,
        value_prop:  product.valueProp,
        website:     product.website,
        pricing:     product.pricing,
      },
      target: {
        role:         icp.role,
        industry:     icp.industry,
        location:     icp.location,
        company_size: icp.size,
        revenue:      icp.revenue,
        pain_points:  pains,
      },
      outreach: {
        sender_name:  outreach.senderName,
        sender_email: outreach.senderEmail,
        daily_limit:  outreach.dailyLimit,
        timezone:     outreach.timezone,
      },
      signature: {
        name:     signature.name,
        title:    signature.title,
        company:  signature.company,
        website:  signature.website,
        phone:    signature.phone,
        logo_url: signature.logo_url,
      },
    };
  }

  function handleSave() {
    if (!selectedId) return;
    const c = campaigns.find(x => x.id === selectedId);
    if (!c) return;
    setSaving(true);
    API.updateCampaign(selectedId, c.name, buildConfig())
      .then(updated => {
        setCampaigns(cs => cs.map(x => x.id === selectedId ? updated : x));
        window.dispatchEvent(new CustomEvent('le-toast', { detail: { kind: 'success', icon: 'check', text: 'Campaign saved.' } }));
      })
      .catch(() => window.dispatchEvent(new CustomEvent('le-toast', { detail: { kind: 'info', icon: 'info', text: 'Save failed.' } })))
      .finally(() => setSaving(false));
  }

  function handleAddCampaign() {
    const name = `Campaign ${campaigns.length + 1}`;
    API.createCampaign(name, {})
      .then(c => {
        setCampaigns(cs => [...cs, c]);
        loadCampaign(c);
      })
      .catch(() => {});
  }

  function handleDeleteCampaign(id, e) {
    e.stopPropagation();
    if (campaigns.length <= 1) return;
    API.deleteCampaign(id)
      .then(() => {
        const remaining = campaigns.filter(c => c.id !== id);
        setCampaigns(remaining);
        if (selectedId === id) loadCampaign(remaining[0]);
      })
      .catch(() => {});
  }

  function handleRenameCampaign(id, newName) {
    const c = campaigns.find(x => x.id === id);
    if (!c || !newName.trim()) return;
    API.updateCampaign(id, newName.trim(), c.config)
      .then(updated => setCampaigns(cs => cs.map(x => x.id === id ? updated : x)))
      .catch(() => {});
  }

  const CSV_HEADERS = [
    'campaign_name','product_name','product_description','product_value_prop',
    'product_website','product_pricing','target_role','target_industry',
    'target_location','target_company_size','target_revenue','target_pain_points',
    'sender_name','sender_email','daily_limit','timezone',
  ];

  function parseCsvLine(line) {
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    return cols;
  }

  function rowToConfig(row, headers) {
    const get = (key) => (row[headers.indexOf(key)] || '').replace(/^"|"$/g, '');
    const pains = get('target_pain_points').split('|').map(s => s.trim()).filter(Boolean);
    return {
      name: get('campaign_name') || 'Imported Campaign',
      config: {
        product: {
          name:        get('product_name'),
          description: get('product_description'),
          value_prop:  get('product_value_prop'),
          website:     get('product_website'),
          pricing:     get('product_pricing'),
        },
        target: {
          role:         get('target_role'),
          industry:     get('target_industry'),
          location:     get('target_location'),
          company_size: get('target_company_size'),
          revenue:      get('target_revenue') || '$1M – $25M ARR',
          pain_points:  pains,
        },
        outreach: {
          sender_name:  get('sender_name'),
          sender_email: get('sender_email'),
          daily_limit:  parseInt(get('daily_limit'), 10) || 30,
          timezone:     get('timezone') || 'Europe/Rome',
        },
      },
    };
  }

  function handleDownloadSample() {
    const sample = [
      CSV_HEADERS.join(','),
      [
        'My SaaS Product',
        'AcmeTool',
        'CRM automation for small agencies',
        'Save 10 hours/week on client reporting',
        'acmetool.com',
        '$49/mo',
        'Agency Owner',
        'Marketing Agency',
        'Italy',
        '1-20 employees',
        '$1M – $25M ARR',
        'too many manual reports|inconsistent onboarding|no pipeline visibility',
        'Your Name',
        'you@gmail.com',
        '30',
        'Europe/Rome',
      ].join(','),
      [
        'Enterprise Product',
        'ProSuite',
        'Workflow automation for mid-size enterprises',
        'Cut operational costs by 30%',
        'prosuite.io',
        '$299/mo',
        'Head of Operations',
        'Manufacturing',
        'Germany',
        '50-500 employees',
        '$25M – $100M ARR',
        'manual approval chains|system integration overhead|compliance tracking',
        'Your Name',
        'you@gmail.com',
        '20',
        'Europe/Berlin',
      ].join(','),
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leadengine-campaigns-sample.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImportCSV(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const lines = ev.target.result.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
        if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');
        const headers = parseCsvLine(lines[0]);
        const rows = lines.slice(1).map(l => parseCsvLine(l));
        const parsed = rows.map(r => rowToConfig(r, headers));
        Promise.all(parsed.map(p => API.createCampaign(p.name, p.config)))
          .then(created => {
            setCampaigns(cs => [...cs, ...created]);
            loadCampaign(created[0]);
            window.dispatchEvent(new CustomEvent('le-toast', { detail: {
              kind: 'success', icon: 'check',
              text: `Imported ${created.length} campaign${created.length > 1 ? 's' : ''}.`,
            }}));
          })
          .catch(() => window.dispatchEvent(new CustomEvent('le-toast', { detail: { kind: 'info', icon: 'info', text: 'Import failed — could not save campaigns.' } })))
          .finally(() => setImporting(false));
      } catch (err) {
        window.dispatchEvent(new CustomEvent('le-toast', { detail: { kind: 'info', icon: 'info', text: `CSV parse error: ${err.message}` } }));
        setImporting(false);
      }
    };
    reader.readAsText(file);
  }

  function handleSuggestIcp() {
    if (!product.name && !product.description) {
      window.dispatchEvent(new CustomEvent('le-toast', { detail: { kind: 'info', icon: 'info', text: 'Fill in product name and description first.' } }));
      return;
    }
    setSuggesting(true);
    API.suggestIcp(product.name, product.description, product.valueProp)
      .then(s => {
        setIcp({
          role:     s.role     || icp.role,
          industry: s.industry || icp.industry,
          location: s.location || icp.location,
          size:     s.company_size || icp.size,
          revenue:  icp.revenue,
        });
        if (Array.isArray(s.pain_points) && s.pain_points.length) setPains(s.pain_points);
        window.dispatchEvent(new CustomEvent('le-toast', { detail: { kind: 'success', icon: 'sparkle', text: 'ICP suggestions applied — review and edit as needed.' } }));
      })
      .catch(() => window.dispatchEvent(new CustomEvent('le-toast', { detail: { kind: 'info', icon: 'info', text: 'Suggestion failed — check your API key.' } })))
      .finally(() => setSuggesting(false));
  }

  const addPain = (e) => {
    if (e.key === 'Enter' && painDraft.trim()) {
      e.preventDefault();
      setPains([...pains, painDraft.trim()]);
      setPainDraft('');
    }
  };

  if (loading) return <div className="empty">Loading campaigns…</div>;

  const selectedCampaign = campaigns.find(c => c.id === selectedId);

  return (
    <React.Fragment>
      <div className="page-head">
        <div>
          <h1>Configure</h1>
          <div className="sub">Manage product campaigns. Each campaign has its own ICP and outreach settings.</div>
        </div>
        <div className="page-head-actions">
          <input ref={importFileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportCSV} />
          <button className="btn" onClick={handleDownloadSample} title="Download a filled example to use as template">
            <Icon name="download" size={14} /> Sample CSV
          </button>
          <button className="btn" onClick={() => importFileRef.current && importFileRef.current.click()} disabled={importing}>
            {importing
              ? <React.Fragment><span className="cursor-rot" /> Importing…</React.Fragment>
              : <React.Fragment><Icon name="list" size={14} /> Import CSV</React.Fragment>}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !selectedId}>
            {saving
              ? <React.Fragment><span className="cursor-rot" /> Saving…</React.Fragment>
              : <React.Fragment><Icon name="check" size={14} /> Save campaign</React.Fragment>}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* Campaign list */}
        <div className="card" style={{ gridRow: '1 / span 2' }}>
          <div className="card-head" style={{ justifyContent: 'space-between' }}>
            <h3>Campaigns</h3>
            <button className="btn btn-icon" title="New campaign" onClick={handleAddCampaign}>
              <Icon name="plus" size={14} />
            </button>
          </div>
          <div style={{ padding: '4px 0' }}>
            {campaigns.map(c => (
              <CampaignListItem
                key={c.id}
                campaign={c}
                active={c.id === selectedId}
                canDelete={campaigns.length > 1}
                onClick={() => loadCampaign(c)}
                onDelete={(e) => handleDeleteCampaign(c.id, e)}
                onRename={(name) => handleRenameCampaign(c.id, name)}
              />
            ))}
          </div>
        </div>

        {/* Product info */}
        <div className="card">
          <div className="card-head">
            <div className="kpi-label" style={{ marginBottom: 0 }}>
              <div className="ic"><Icon name="sparkle" size={14} /></div>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Product info</span>
            </div>
          </div>
          <div className="card-body">
            <div className="field">
              <label>Product name</label>
              <input type="text" value={product.name} onChange={e => setProduct({ ...product, name: e.target.value })} placeholder="e.g. Acme SaaS" />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea value={product.description} onChange={e => setProduct({ ...product, description: e.target.value })} placeholder="What does your product do? Who uses it?" />
              <div className="hint">Used by the AI to write personalized intros.</div>
            </div>
            <div className="field">
              <label>Value proposition</label>
              <textarea rows="2" value={product.valueProp} onChange={e => setProduct({ ...product, valueProp: e.target.value })} placeholder="A one-liner you'd tell a prospect at a dinner party." style={{ minHeight: 60 }} />
            </div>
            <div className="field-row">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Website</label>
                <input type="text" value={product.website} onChange={e => setProduct({ ...product, website: e.target.value })} placeholder="acme.com" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Pricing</label>
                <input type="text" value={product.pricing} onChange={e => setProduct({ ...product, pricing: e.target.value })} placeholder="$49/mo" />
              </div>
            </div>
            <div style={{ height: 16 }} />
            <div className="field-row">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Sender name</label>
                <input type="text" value={outreach.senderName} onChange={e => setOutreach({ ...outreach, senderName: e.target.value })} placeholder="Your name" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Sender email</label>
                <input type="email" value={outreach.senderEmail} onChange={e => setOutreach({ ...outreach, senderEmail: e.target.value })} placeholder="you@gmail.com" />
              </div>
            </div>
          </div>
        </div>

        {/* ICP */}
        <div className="card">
          <div className="card-head" style={{ justifyContent: 'space-between' }}>
            <div className="kpi-label" style={{ marginBottom: 0 }}>
              <div className="ic"><Icon name="target" size={14} /></div>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Target ICP</span>
            </div>
            <button
              className="btn"
              onClick={handleSuggestIcp}
              disabled={suggesting}
              title="Let Claude suggest your ICP based on the product info"
            >
              {suggesting
                ? <React.Fragment><span className="cursor-rot" /> Thinking…</React.Fragment>
                : <React.Fragment><Icon name="sparkle" size={13} /> Suggest with AI</React.Fragment>}
            </button>
          </div>
          <div className="card-body">
            <div className="field">
              <label>Role / title</label>
              <input type="text" value={icp.role} onChange={e => setIcp({ ...icp, role: e.target.value })} placeholder="e.g. CEO, Founder, Head of Marketing" />
              <div className="hint">Comma-separate variations</div>
            </div>
            <div className="field">
              <label>Industry</label>
              <input type="text" value={icp.industry} onChange={e => setIcp({ ...icp, industry: e.target.value })} placeholder="e.g. SaaS, Marketing Agency, E-commerce" />
            </div>
            <div className="field-row">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Location</label>
                <input type="text" value={icp.location} onChange={e => setIcp({ ...icp, location: e.target.value })} placeholder="e.g. Milan, Italy" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Company size</label>
                <input type="text" value={icp.size} onChange={e => setIcp({ ...icp, size: e.target.value })} placeholder="e.g. 10-200 employees" />
              </div>
            </div>
            <div style={{ height: 16 }} />
            <div className="field">
              <label>Annual revenue</label>
              <select value={icp.revenue} onChange={e => setIcp({ ...icp, revenue: e.target.value })}>
                <option>Pre-revenue</option>
                <option>Under $1M ARR</option>
                <option>$1M – $25M ARR</option>
                <option>$25M – $100M ARR</option>
                <option>$100M+ ARR</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Pain points</label>
              <div className="tag-input">
                {pains.map((p, i) => (
                  <span className="tag" key={i}>
                    {p}
                    <button onClick={() => setPains(pains.filter((_, j) => j !== i))} title="Remove"><Icon name="x" size={11} /></button>
                  </span>
                ))}
                <input
                  placeholder={pains.length ? 'Add another…' : 'Type a pain point and press Enter'}
                  value={painDraft}
                  onChange={e => setPainDraft(e.target.value)}
                  onKeyDown={addPain}
                />
              </div>
              <div className="hint">The AI uses these to score leads and tailor outreach.</div>
            </div>
          </div>
        </div>

      </div>

      {/* Email Signature */}
      <div className="card" style={{ marginTop: 16, gridColumn: '2 / span 2' }}>
        <div className="card-head">
          <h3>Email Signature</h3>
          <div className="sub">Appended to every outreach email</div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Name</label>
              <input type="text" value={signature.name} onChange={e => setSignature({ ...signature, name: e.target.value })} placeholder="auto-filled from sender name" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Title</label>
              <input type="text" value={signature.title} onChange={e => setSignature({ ...signature, title: e.target.value })} placeholder="CEO, Founder, Head of Sales" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Company</label>
              <input type="text" value={signature.company} onChange={e => setSignature({ ...signature, company: e.target.value })} placeholder="Acme Corp" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Website</label>
              <input type="text" value={signature.website} onChange={e => setSignature({ ...signature, website: e.target.value })} placeholder="https://acme.com" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Phone</label>
              <input type="text" value={signature.phone} onChange={e => setSignature({ ...signature, phone: e.target.value })} placeholder="+1 555 000 0000" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Logo URL</label>
              <input type="text" value={signature.logo_url} onChange={e => setSignature({ ...signature, logo_url: e.target.value })} placeholder="https://acme.com/logo.png" />
              <div className="hint">Public image URL, shown in HTML emails</div>
            </div>
          </div>
          <div className="divider" style={{ margin: '16px 0' }} />
          <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6 }}>
            {signature.logo_url && (
              <img src={signature.logo_url} height="32" style={{ marginBottom: 8, display: 'block' }} alt="logo" />
            )}
            <strong style={{ color: 'var(--ink-2)' }}>{signature.name || 'Your Name'}</strong>
            {(signature.title || signature.company) && (
              <div>
                {signature.title}
                {signature.title && signature.company ? ' · ' : ''}
                {signature.company}
              </div>
            )}
            {(signature.website || signature.phone) && (
              <div>
                {signature.website}
                {signature.website && signature.phone ? ' | ' : ''}
                {signature.phone}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Email preview */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head" style={{ justifyContent: 'space-between' }}>
          <div>
            <h3>Live preview</h3>
            <div className="sub">How the AI introduces your product in cold outreach</div>
          </div>
          <span className="badge status qualified"><Icon name="sparkle" size={10} /> AI-drafted</span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: 4, fontSize: 13 }}>
            <div className="muted">To:</div>
            <div>prospect@{(icp.industry || 'company').toLowerCase().replace(/\s+/g, '')}.com</div>
            <div className="muted">From:</div>
            <div>{outreach.senderEmail || 'you@gmail.com'}</div>
            <div className="muted">Subject:</div>
            <div><b>Quick question</b>{icp.role ? ` — ${icp.role} at ${icp.industry}` : ''}</div>
          </div>
          <div className="divider" style={{ margin: '14px 0' }} />
          <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--ink-2)' }}>
            Hi there{product.valueProp ? ` — I noticed your business could benefit from ${product.valueProp.toLowerCase()}` : ''}.<br /><br />
            {product.name
              ? `${product.name} ${product.description || '— helps businesses like yours.'}`
              : 'Fill in your product details above to see a preview.'}<br /><br />
            Worth 15 minutes next week to see if it fits?<br /><br />
            — {outreach.senderName || 'Your Name'}
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

function CampaignListItem({ campaign, active, canDelete, onClick, onDelete, onRename }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(campaign.name);

  function commitRename() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== campaign.name) onRename(draft.trim());
    else setDraft(campaign.name);
  }

  return (
    <div
      className={`settings-nav-item ${active ? 'active' : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
        cursor: 'pointer', borderRadius: 0,
        background: active ? 'var(--teal-50)' : 'transparent',
        borderLeft: active ? '2px solid var(--teal)' : '2px solid transparent',
      }}
      onClick={onClick}
    >
      <Icon name="target" size={13} style={{ color: active ? 'var(--teal)' : 'var(--ink-3)', flexShrink: 0 }} />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditing(false); setDraft(campaign.name); } }}
          onClick={e => e.stopPropagation()}
          style={{ flex: 1, fontSize: 13, border: '1px solid var(--teal)', borderRadius: 4, padding: '1px 5px', background: 'var(--surface)', color: 'var(--ink)' }}
        />
      ) : (
        <span
          style={{ flex: 1, fontSize: 13, fontWeight: active ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}
          title="Double-click to rename"
        >
          {campaign.name}
        </span>
      )}
      {!editing && (
        <button
          className="btn-icon"
          title="Send emails for this campaign"
          onClick={e => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('le-outreach', { detail: campaign.id }));
            window.dispatchEvent(new CustomEvent('le-navigate', { detail: 'outreach' }));
          }}
          style={{ opacity: 0.5, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--teal)' }}
          onMouseEnter={e => e.currentTarget.style.opacity = 1}
          onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
        >
          <Icon name="send" size={11} />
        </button>
      )}
      {canDelete && !editing && (
        <button
          className="btn-icon"
          onClick={onDelete}
          title="Delete campaign"
          style={{ opacity: 0.4, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
          onMouseEnter={e => e.currentTarget.style.opacity = 1}
          onMouseLeave={e => e.currentTarget.style.opacity = 0.4}
        >
          <Icon name="x" size={11} />
        </button>
      )}
    </div>
  );
}

window.ConfigureScreen = ConfigureScreen;
