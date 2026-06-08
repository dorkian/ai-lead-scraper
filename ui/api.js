// LeadEngine API client — same origin as the page
(function () {
  const BASE = window.location.origin;

  async function get(path) {
    const r = await fetch(BASE + path);
    if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
    return r.json();
  }

  async function post(path, body) {
    const r = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`POST ${path} → ${r.status}`);
    return r.json();
  }

  async function put(path, body) {
    const r = await fetch(BASE + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`PUT ${path} → ${r.status}`);
    return r.json();
  }

  async function patch(path, body) {
    const r = await fetch(BASE + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}`);
    return r.json();
  }

  async function del(path) {
    const r = await fetch(BASE + path, { method: 'DELETE' });
    if (!r.ok) throw new Error(`DELETE ${path} → ${r.status}`);
    return r.json();
  }

  window.API = {
    // Campaigns
    getCampaigns: () => get('/api/campaigns'),
    createCampaign: (name, config) => post('/api/campaigns', { name, config }),
    updateCampaign: (id, name, config) => put(`/api/campaigns/${id}`, { name, config }),
    deleteCampaign: (id) => del(`/api/campaigns/${id}`),

    // ICP suggestion
    suggestIcp: (product_name, description, value_prop) =>
      post('/api/suggest-icp', { product_name, description, value_prop }),

    // Leads
    createLead: (body) => post('/api/leads', body),
    getLeads: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
      return get('/api/leads' + (qs ? '?' + qs : ''));
    },
    getLead: (id) => get(`/api/leads/${id}`),
    patchLead: (id, body) => patch(`/api/leads/${id}`, body),
    sendLead: (id) => post(`/api/leads/${id}/send`, {}),
    resetLead: (id) => patch(`/api/leads/${id}`, { status: 'new' }),

    // Config (legacy)
    getConfig: () => get('/api/config'),
    saveConfig: (body) => post('/api/config', body),

    // Sheets
    getSheetsStatus: () => get('/api/sheets/status'),
    exportToSheets: (body) => post('/api/sheets/export', body),

    // Pipeline
    startRun: (body) => post('/api/run', body),
    getStats: (campaign_id) => get('/api/stats' + (campaign_id ? `?campaign_id=${campaign_id}` : '')),
    getEmails: () => get('/api/emails'),

    subscribeRunStatus(onEvent, onDone) {
      const es = new EventSource(BASE + '/api/run/status');
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.step === 'done' || data.step === 'error') {
            onEvent(data);
            es.close();
            onDone(data);
          } else if (data.step !== 'heartbeat') {
            onEvent(data);
          }
        } catch (_) {}
      };
      es.onerror = () => { es.close(); onDone({ step: 'error', message: 'SSE connection lost' }); };
      return () => es.close();
    },
  };
})();
