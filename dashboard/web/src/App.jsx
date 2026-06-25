import React, {useCallback, useEffect, useRef, useState} from 'react';
import StepCard from './StepCard.jsx';
import AudioPanel from './AudioPanel.jsx';
import SocialPostingPanel from './SocialPostingPanel.jsx';
import {DUEL_STEP_SET, duelHref} from './duelSteps.js';

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

  const createToday = async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    try {
      await api('/api/create-date', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({date: today})
      });
      const {dates: list} = await api('/api/dates');
      setDates(list);
      setDate(today);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

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

  const saveBriefing = async (content) => {
    try {
      await api('/api/briefing/corrected', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({date, content})
      });
      await refresh(date);
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

  const recordAudio = async (sceneId, blob, mimeType) => {
    try {
      await api(`/api/audio/record?date=${date}&sceneId=${encodeURIComponent(sceneId)}`, {
        method: 'POST',
        headers: {'Content-Type': mimeType || 'audio/webm'},
        body: blob
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const setAudioSource = async (audioSource) => {
    try {
      await api('/api/audio/source', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({date, audioSource})
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const uploadPhoneScenes = async ({mid, password}) => {
    const result = await api('/api/phone/upload-scenes', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({date, mid, password})
    });
    await refresh(date);
    return result;
  };

  const deletePhoneFolder = async ({password}) => {
    const result = await api('/api/phone/delete-folder', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({date, password})
    });
    await refresh(date);
    return result;
  };

  // The Quote Duel steps (17–23) live on their own page (?view=duel), reachable
  // from the step 9 card. Keep them out of the main pipeline + progress count.
  const mainSteps = data ? data.steps.filter((step) => !DUEL_STEP_SET.has(step.id)) : [];
  const doneCount = mainSteps.filter((step) => step.status === 'done').length;
  const busy = Boolean(data?.activeRun);
  const openDuelPage = () => window.open(duelHref(date), '_blank', 'noopener');
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
              {doneCount}/{mainSteps.length} steps done
            </span>
          )}
          <button className="new-date-btn" onClick={createToday}>
            + New date (today)
          </button>
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
            {mainSteps.map((step) => (
              <StepCard
                key={step.id}
                step={step}
                social={step.id === 'social-package' ? data.social : null}
                log={logs[step.id] || step.lastRun?.logTail || []}
                busy={busy}
                running={data.activeRun?.stepId === step.id}
                onRun={(actionId, options) => runStep(step.id, actionId, options)}
                onReview={step.id === 'html-review' ? setReviewed : null}
                onOpenDuel={step.id === 'html-review' ? openDuelPage : null}
                briefing={step.id === 'remote-pull' ? data.correctedBriefing : null}
                onSaveBriefing={step.id === 'remote-pull' ? saveBriefing : null}
              />
            ))}
          </section>

          <SocialPostingPanel social={data.social} onUploadPhoneScenes={uploadPhoneScenes} onDeletePhoneFolder={deletePhoneFolder} />

          <AudioPanel
            entries={data.audio}
            busy={busy}
            audioSource={data.audioSource || 'ai'}
            activeSceneId={audioRegenActive}
            log={audioRegenActive ? logs[`audio-regen:${audioRegenActive}`] || [] : []}
            onRegenerate={regenerateAudio}
            onSaveText={saveAudioText}
            onRecord={recordAudio}
            onSetAudioSource={setAudioSource}
          />
        </main>
      )}
    </div>
  );
}
