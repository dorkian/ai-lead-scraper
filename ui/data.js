// No mock data — all data comes from the API.
window.LEADS = [];
window.ACTIVITY = [];
window.CHART_DAYS = [];

// Adapts an API lead row to the shape components expect.
window.adaptLead = function (l) {
  const raw = typeof l.raw_data === 'string' ? (() => { try { return JSON.parse(l.raw_data); } catch (_) { return {}; } })() : (l.raw_data || {});
  return {
    id:           l.id,
    company:      l.company  || l.domain || 'Unknown',
    domain:       l.domain   || '',
    email:        l.email    || '—',
    contact:      l.name     || '—',
    source:       l.source   || 'gmaps',
    score:        l.iq_score != null ? l.iq_score : 0,
    status:       l.status   || 'new',
    date:         l.created_at ? new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
    location:     raw.formatted_address || '—',
    size:         '—',
    industry:     '—',
    notes:        '',
    phone:        raw.formatted_phone_number || '—',
    website:      l.domain   || '',
    lastActivity: l.source === 'manual' ? 'Added manually'
               : l.source === 'reddit' ? 'Discovered via Reddit'
               : 'Discovered via Google Maps',
  };
};
