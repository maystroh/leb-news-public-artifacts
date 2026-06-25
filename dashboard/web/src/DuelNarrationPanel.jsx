import React, {useEffect, useState} from 'react';

export default function DuelNarrationPanel({entries = [], confirmedAt, busy, onSaveText, onConfirm}) {
  const [drafts, setDrafts] = useState({});
  useEffect(() => {
    setDrafts(Object.fromEntries(entries.map((e) => [e.duelId, e.effectiveText || ''])));
  }, [entries]);

  if (!entries.length) {
    return (
      <section className="audio-panel">
        <h2>Duel narration</h2>
        <p className="hint">Build duel content first (step 18) to review narration.</p>
      </section>
    );
  }

  return (
    <section className="audio-panel">
      <div className="audio-panel-head">
        <h2>Duel narration</h2>
        <p className="description">Edit each clash's spoken line, then Confirm before generating audio.</p>
      </div>
      <div className="audio-list">
        {entries.map((e) => (
          <div className="audio-row" key={e.duelId}>
            <div className="audio-meta">
              <strong>{e.duelId}{e.isOverridden ? ' • edited' : ''}</strong>
              <span>{e.outlets.filter(Boolean).join('  ✕  ')}</span>
              {(e.quotes || []).filter(Boolean).map((q, i) => (<span key={i} className="hint">«{q}»</span>))}
              <span className="hint">source: {e.source || 'none'}</span>
            </div>
            <textarea
              value={drafts[e.duelId] ?? ''}
              onChange={(ev) => setDrafts((d) => ({...d, [e.duelId]: ev.target.value}))}
            />
            <div className="story-actions">
              <button className="btn primary" disabled={busy} onClick={() => onSaveText(e.duelId, drafts[e.duelId] ?? '')}>Save</button>
              <button className="btn ghost" disabled={busy} onClick={() => onSaveText(e.duelId, '')}>Reset to default</button>
            </div>
          </div>
        ))}
      </div>
      <div className="audio-panel-head">
        <button className="btn primary" disabled={busy} onClick={onConfirm}>Confirm narration</button>
        <p className={`phone-status ${confirmedAt ? 'done' : 'pending'}`}>
          {confirmedAt ? `Confirmed ${new Date(confirmedAt).toLocaleString()}` : 'Not confirmed — audio step is gated.'}
        </p>
      </div>
    </section>
  );
}
