import React, {useCallback, useEffect, useMemo, useState} from 'react';

// Standalone cross-date post-performance tracker (?view=metrics). Self-contained:
// talks to /api/metrics{,/seed,/update,/delete}. The two aggregate tables (by hook,
// by outlet) are the point — they drive the 3-week keep/kill decision.
async function api(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return body;
}

const FIELD_LABELS = {
  impressions: 'Impressions',
  reach: 'Reach',
  avgPctViewed: 'Avg % viewed',
  hookRetentionPct: 'Hook 3s %',
  saves: 'Saves',
  shares: 'Shares',
  follows: 'Follows'
};

const PLATFORM_LABELS = {instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok'};

const fmt = (value, suffix = '') => (value == null ? '—' : `${value}${suffix}`);

function RecordRow({record, fields, onSave, onDelete, busy}) {
  const [draft, setDraft] = useState(() => ({
    metrics: {...record.metrics},
    postUrl: record.postUrl || '',
    note: record.note || ''
  }));
  const [saving, setSaving] = useState(false);

  const setMetric = (field, value) =>
    setDraft((prev) => ({...prev, metrics: {...prev.metrics, [field]: value}}));

  const save = async () => {
    setSaving(true);
    try {
      await onSave(record.id, draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`metric-row ${record.hasMetrics ? 'filled' : 'pending'}`}>
      <div className="metric-row-head">
        <div>
          <strong>{record.outlet || record.duelId}</strong>
          <span className="metric-tags">
            <span className="tag">{record.date}</span>
            <span className="tag">{PLATFORM_LABELS[record.platform] || record.platform}</span>
            {record.hook && <span className="tag">{record.hook}</span>}
          </span>
        </div>
        <button className="btn ghost danger" disabled={busy || saving} onClick={() => onDelete(record.id)}>
          Delete
        </button>
      </div>
      <div className="metric-grid">
        {fields.map((field) => (
          <label key={field} className="metric-field">
            <span>{FIELD_LABELS[field] || field}</span>
            <input
              type="number"
              inputMode="decimal"
              value={draft.metrics[field] ?? ''}
              onChange={(event) => setMetric(field, event.target.value)}
              placeholder="—"
            />
          </label>
        ))}
      </div>
      <div className="metric-extra">
        <input
          className="metric-url"
          type="url"
          value={draft.postUrl}
          placeholder="Post URL (optional)"
          onChange={(event) => setDraft((prev) => ({...prev, postUrl: event.target.value}))}
        />
        <input
          className="metric-note"
          type="text"
          value={draft.note}
          placeholder="Lab note — what did you try? (hook variant, framing…)"
          onChange={(event) => setDraft((prev) => ({...prev, note: event.target.value}))}
        />
        <button className="btn primary" disabled={busy || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function AggTable({title, rows, keyHeader}) {
  if (!rows.length) return null;
  return (
    <div className="agg-card">
      <h3>{title}</h3>
      <table className="agg-table">
        <thead>
          <tr>
            <th>{keyHeader}</th>
            <th>Posts</th>
            <th>Filled</th>
            <th>Avg % viewed</th>
            <th>Median reach</th>
            <th>Saves</th>
            <th>Shares</th>
            <th>Breakouts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={row.breakouts ? 'has-breakout' : ''}>
              <td className="agg-key">{row.key}</td>
              <td>{row.posts}</td>
              <td>{row.filled}</td>
              <td className="agg-strong">{fmt(row.avgPctViewed, '%')}</td>
              <td>{fmt(row.medianReach)}</td>
              <td>{row.totalSaves || 0}</td>
              <td>{row.totalShares || 0}</td>
              <td>{row.breakouts ? `🚀 ${row.breakouts}` : '0'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MetricsApp() {
  const [dates, setDates] = useState([]);
  const [seedDate, setSeedDate] = useState('');
  const [seedPlatforms, setSeedPlatforms] = useState(['instagram', 'youtube', 'tiktok']);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showFilled, setShowFilled] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const state = await api('/api/metrics');
      setData(state);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    api('/api/dates')
      .then(({dates: list}) => {
        setDates(list);
        setSeedDate((current) => current || list[0] || '');
      })
      .catch((err) => setError(err.message));
    refresh();
  }, [refresh]);

  const togglePlatform = (platform) =>
    setSeedPlatforms((prev) => (prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]));

  const seed = async () => {
    if (!seedDate || !seedPlatforms.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api('/api/metrics/seed', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({date: seedDate, platforms: seedPlatforms})
      });
      await refresh();
      setError(result.added ? null : `No new rows — all ${result.total} already tracked for that day.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveRecord = async (id, draft) => {
    setError(null);
    try {
      await api('/api/metrics/update', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id, metrics: draft.metrics, postUrl: draft.postUrl, note: draft.note})
      });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteRecord = async (id) => {
    if (!window.confirm('Delete this tracked post?')) return;
    setBusy(true);
    try {
      await api('/api/metrics/delete', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id})
      });
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const fields = data?.fields || Object.keys(FIELD_LABELS);
  const records = data?.records || [];
  const pending = useMemo(() => records.filter((rec) => !rec.hasMetrics), [records]);
  const filled = useMemo(() => records.filter((rec) => rec.hasMetrics), [records]);
  const totals = data?.aggregates?.totals;

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Radar Beirut — Post Tracker</h1>
          <p className="subtitle">Which hook + which outlet duel travels · keep/kill scorecard · local only</p>
        </div>
        <div className="header-right">
          <a className="new-date-btn" href="/" target="_blank" rel="noreferrer">
            ↗ Main dashboard
          </a>
          <a className="new-date-btn" href="/?view=duel" target="_blank" rel="noreferrer">
            ↗ Quote Duel
          </a>
        </div>
      </header>

      {error && (
        <div className="error-banner" onClick={() => setError(null)}>
          {error} <span className="dismiss">✕ dismiss</span>
        </div>
      )}

      <main className="metrics-main">
        <section className="metrics-seed">
          <h2>Log a day's posts</h2>
          <p className="hint">Seeds one pending row per duel clip × platform (pulls outlet + hook from that day's duel). Re-seeding never overwrites numbers.</p>
          <div className="seed-controls">
            <select value={seedDate} onChange={(event) => setSeedDate(event.target.value)}>
              {!dates.length && <option value="">No dates</option>}
              {dates.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <div className="platform-checks">
              {['instagram', 'youtube', 'tiktok'].map((platform) => (
                <label key={platform} className={`platform-check ${seedPlatforms.includes(platform) ? 'on' : ''}`}>
                  <input type="checkbox" checked={seedPlatforms.includes(platform)} onChange={() => togglePlatform(platform)} />
                  {PLATFORM_LABELS[platform]}
                </label>
              ))}
            </div>
            <button className="btn primary" disabled={busy || !seedDate || !seedPlatforms.length} onClick={seed}>
              {busy ? 'Adding…' : 'Add posts'}
            </button>
          </div>
        </section>

        {totals && (
          <section className="scorecard">
            <div className="score-tile">
              <span className="score-num">{totals.posts}</span>
              <span className="score-label">tracked posts</span>
            </div>
            <div className="score-tile">
              <span className="score-num">{totals.filled}</span>
              <span className="score-label">with metrics</span>
            </div>
            <div className="score-tile">
              <span className="score-num">{fmt(totals.overallMedianReach)}</span>
              <span className="score-label">median reach</span>
            </div>
            <div className={`score-tile ${totals.breakouts ? 'win' : ''}`}>
              <span className="score-num">{totals.breakouts ? `🚀 ${totals.breakouts}` : '0'}</span>
              <span className="score-label">breakouts (≥10× median)</span>
            </div>
          </section>
        )}

        {data?.aggregates && (
          <section className="aggregates">
            <AggTable title="By hook variant" keyHeader="Hook" rows={data.aggregates.byHook} />
            <AggTable title="By outlet duel" keyHeader="Outlet" rows={data.aggregates.byOutlet} />
            <AggTable title="By platform" keyHeader="Platform" rows={data.aggregates.byPlatform} />
          </section>
        )}

        <section className="records">
          <h2>Pending — fill these in 24–48h after posting ({pending.length})</h2>
          {!pending.length && <p className="empty">Nothing pending. Seed a day above.</p>}
          {pending.map((record) => (
            <RecordRow key={record.id} record={record} fields={fields} onSave={saveRecord} onDelete={deleteRecord} busy={busy} />
          ))}
        </section>

        {filled.length > 0 && (
          <section className="records">
            <h2 className="collapsible" onClick={() => setShowFilled((v) => !v)}>
              {showFilled ? '▾' : '▸'} Filled ({filled.length})
            </h2>
            {showFilled &&
              filled.map((record) => (
                <RecordRow key={record.id} record={record} fields={fields} onSave={saveRecord} onDelete={deleteRecord} busy={busy} />
              ))}
          </section>
        )}
      </main>
    </div>
  );
}
