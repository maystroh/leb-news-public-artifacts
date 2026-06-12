import React, {useCallback, useEffect, useRef, useState} from 'react';
import StepCard from './StepCard.jsx';
import AudioPanel from './AudioPanel.jsx';

async function api(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return body;
}

export default function App() {
  const [dates, setDates] = useState([]);
  const [date, setDate] = useState(null);
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
        if (list.length) setDate((current) => current || list[0]);
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

  const setReviewed = async (done) => {
    try {
      await api('/api/review', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({date, done})
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const regenerateAudio = async (sceneId) => {
    try {
      await api('/api/audio/regenerate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({date, sceneId})
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const saveAudioText = async (sceneId, text) => {
    try {
      await api('/api/audio/script', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({date, sceneId, text})
      });
      await refresh(date);
    } catch (err) {
      setError(err.message);
    }
  };

  const doneCount = data ? data.steps.filter((step) => step.status === 'done').length : 0;
  const busy = Boolean(data?.activeRun);
  const audioRegenActive = data?.activeRun?.stepId?.startsWith('audio-regen:')
    ? data.activeRun.stepId.slice('audio-regen:'.length)
    : null;

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Radar Beirut — Briefing Dashboard</h1>
          <p className="subtitle">Guided workflow runner · local only</p>
        </div>
        <div className="header-right">
          {data && (
            <span className="progress-pill">
              {doneCount}/{data.steps.length} steps done
            </span>
          )}
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

      {data && (
        <main>
          <section className="pipeline">
            {data.steps.map((step) => (
              <StepCard
                key={step.id}
                step={step}
                log={logs[step.id] || step.lastRun?.logTail || []}
                busy={busy}
                running={data.activeRun?.stepId === step.id}
                onRun={(actionId, options) => runStep(step.id, actionId, options)}
                onReview={step.id === 'html-review' ? setReviewed : null}
              />
            ))}
          </section>

          <AudioPanel
            entries={data.audio}
            busy={busy}
            activeSceneId={audioRegenActive}
            log={audioRegenActive ? logs[`audio-regen:${audioRegenActive}`] || [] : []}
            onRegenerate={regenerateAudio}
            onSaveText={saveAudioText}
          />
        </main>
      )}
    </div>
  );
}
