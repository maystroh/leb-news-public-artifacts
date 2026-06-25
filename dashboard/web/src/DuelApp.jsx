import React, {useCallback, useEffect, useRef, useState} from 'react';
import StepCard from './StepCard.jsx';
import DuelNarrationPanel from './DuelNarrationPanel.jsx';
import {DUEL_STEP_SET, DUEL_STEP_IDS, SHARED_STEP_SET, SHARED_STEP_IDS} from './duelSteps.js';

// Standalone Quote Duel page (?view=duel). Self-contained on purpose: it shares
// only StepCard + the duel step id list with the main dashboard, so duel work can
// be iterated without touching App.jsx. Talks to the same /api endpoints + SSE.
async function api(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return body;
}

export default function DuelApp() {
  const urlDate = new URLSearchParams(window.location.search).get('date');
  const [dates, setDates] = useState([]);
  const [date, setDate] = useState(urlDate || null);
  const [data, setData] = useState(null);
  const [logs, setLogs] = useState({});
  const [error, setError] = useState(null);
  const esRef = useRef(null);

  const refresh = useCallback(async (selectedDate) => {
    if (!selectedDate) return;
    try {
      const state = await api(`/api/state?date=${selectedDate}`);
      setData(state);
      if (state.activeRun) {
        setLogs((prev) => ({...prev, [state.activeRun.stepId]: state.activeRun.log}));
      }
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    api('/api/dates')
      .then(({dates: list}) => {
        setDates(list);
        setDate((current) => current || list[0] || null);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!date) return;
    setData(null);
    setLogs({});
    refresh(date);

    const es = new EventSource(`/api/events?date=${date}`);
    esRef.current = es;
    es.onmessage = (message) => {
      const event = JSON.parse(message.data);
      if (event.type === 'log') {
        setLogs((prev) => ({
          ...prev,
          [event.stepId]: [...(prev[event.stepId] || []), event.line].slice(-2000)
        }));
      } else if (event.type === 'run-started') {
        setLogs((prev) => ({...prev, [event.stepId]: []}));
        refresh(date);
      } else if (event.type === 'run-finished' || event.type === 'state-changed') {
        refresh(date);
      }
    };
    return () => es.close();
  }, [date, refresh]);

  const runStep = async (stepId, actionId, options) => {
    try {
      await api('/api/run', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({date, stepId, actionId, ...(options ? {options} : {})})
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const saveDuelText = async (duelId, text) => {
    try {
      await api('/api/duel/script', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({date, duelId, text})});
    } catch (err) {
      setError(err.message);
    }
  };
  const confirmDuelText = async () => {
    try {
      await api('/api/duel/confirm', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({date})});
    } catch (err) {
      setError(err.message);
    }
  };

  const order = [...DUEL_STEP_IDS, ...SHARED_STEP_IDS];
  const duelSteps = data
    ? data.steps
        .filter((step) => DUEL_STEP_SET.has(step.id) || SHARED_STEP_SET.has(step.id))
        .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    : [];
  const doneCount = duelSteps.filter((step) => step.status === 'done').length;
  const busy = Boolean(data?.activeRun);

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Radar Beirut — Quote Duel</h1>
          <p className="subtitle">Steps 17–23 · separate from the main briefing video · local only</p>
        </div>
        <div className="header-right">
          {data && (
            <span className="progress-pill">
              {doneCount}/{duelSteps.length} steps done
            </span>
          )}
          <a className="new-date-btn" href="/" target="_blank" rel="noreferrer">
            ↗ Main dashboard
          </a>
          <select value={date || ''} onChange={(event) => setDate(event.target.value)}>
            {dates.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && (
        <div className="error-banner" onClick={() => setError(null)}>
          {error} <span className="dismiss">✕ dismiss</span>
        </div>
      )}

      {!dates.length && <p className="empty">No briefings/YYYY-MM-DD folders found.</p>}
      {date && !data && !error && <p className="empty">Loading {date}…</p>}
      {data && !duelSteps.length && (
        <p className="empty">No Quote Duel steps for {date} (locked until the briefing is ready).</p>
      )}

      {data && duelSteps.length > 0 && (
        <main>
          <section className="pipeline">
            {duelSteps.map((step) => (
              <StepCard
                key={step.id}
                step={step}
                social={step.id === 'social-package' ? data.social : null}
                log={logs[step.id] || step.lastRun?.logTail || []}
                busy={busy}
                running={data.activeRun?.stepId === step.id}
                onRun={(actionId, options) => runStep(step.id, actionId, options)}
              />
            ))}
          </section>
          {data?.duel && (
            <DuelNarrationPanel
              entries={data.duel.narration}
              confirmedAt={data.duel.narrationConfirmedAt}
              busy={busy}
              onSaveText={saveDuelText}
              onConfirm={confirmDuelText}
            />
          )}
        </main>
      )}
    </div>
  );
}
