import React, {useEffect, useState} from 'react';

// Per-duel narration editor. Mirrors AudioPanel's SceneRow look (scene-row /
// rtl script-editor / script-editor-actions) so it matches the dashboard's scene
// narration editor — but text-only: audio is generated in a separate step.
function DuelRow({entry, busy, onSaveText}) {
  const [draft, setDraft] = useState(entry.effectiveText);
  const [saving, setSaving] = useState(false);

  const dirty = draft.trim() !== entry.effectiveText.trim();
  // Refresh from server state on rebuild/save, but never over unsaved local edits.
  useEffect(() => {
    if (!dirty) setDraft(entry.effectiveText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.effectiveText]);

  const save = async () => {
    setSaving(true);
    try {
      await onSaveText(entry.duelId, draft);
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    setDraft(entry.defaultText);
    setSaving(true);
    try {
      await onSaveText(entry.duelId, '');
    } finally {
      setSaving(false);
    }
  };

  const outlets = (entry.outlets || []).filter(Boolean).join('  ✕  ');
  const quotes = (entry.quotes || []).filter(Boolean);

  return (
    <div className="scene-row">
      <div className="scene-row-head">
        <span className="mono scene-id">{entry.duelId}</span>
        <span className="rtl outlet-name">{outlets}</span>
        {entry.isOverridden && <span className="badge badge-attention">edited script</span>}
        <span className="scene-row-spacer" />
        {entry.source && <span className="badge badge-source muted">{entry.source}</span>}
      </div>

      {quotes.length > 0 && (
        <p className="rtl hint duel-clash-quotes">{quotes.map((q) => `«${q}»`).join('  ·  ')}</p>
      )}

      <textarea
        className="rtl script-editor"
        rows={Math.min(8, Math.max(2, Math.ceil((draft.length || 1) / 110)))}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        spellCheck={false}
      />
      <div className="script-editor-actions">
        <span className="char-count">{draft.trim().length} chars</span>
        {dirty && (
          <>
            <button className="btn primary" disabled={saving || busy} onClick={save}>
              {saving ? 'Saving…' : 'Save text'}
            </button>
            <button className="btn ghost" disabled={saving} onClick={() => setDraft(entry.effectiveText)}>
              Discard
            </button>
          </>
        )}
        {!dirty && entry.isOverridden && (
          <button className="btn ghost" disabled={saving || busy} onClick={resetToDefault}>
            Reset to default
          </button>
        )}
        {dirty && <span className="hint">Unsaved — generating audio still uses the previous text snapshot.</span>}
      </div>
    </div>
  );
}

export default function DuelNarrationPanel({entries = [], confirmedAt, busy, onSaveText, onConfirm}) {
  if (!entries.length) {
    return (
      <section className="audio-panel">
        <h2>Duel narration</h2>
        <p className="empty">No duel content yet — build it first (step 18) to review narration.</p>
      </section>
    );
  }

  return (
    <section className="audio-panel">
      <div className="audio-panel-head">
        <h2>Duel narration</h2>
        <span className={`badge ${confirmedAt ? 'badge-done' : 'badge-attention'}`}>
          {confirmedAt ? 'confirmed' : 'not confirmed'}
        </span>
      </div>
      <p className="description">
        This is the exact line read per clash when you run step 19. Edit and save any clash — edits are stored in{' '}
        <code>audio/quote-duel-text-overrides.json</code> and survive rebuilds. <strong>Confirm</strong> the narration to
        unlock audio generation; any later edit re-gates it.
      </p>
      {entries.map((entry) => (
        <DuelRow key={entry.duelId} entry={entry} busy={busy} onSaveText={onSaveText} />
      ))}
      <div className="script-editor-actions duel-confirm-row">
        <button className="btn primary" disabled={busy} onClick={onConfirm}>
          {confirmedAt ? 'Re-confirm narration' : 'Confirm narration'}
        </button>
        <span className="hint">
          {confirmedAt ? `Confirmed ${new Date(confirmedAt).toLocaleString()}` : 'Not confirmed — the audio step is gated.'}
        </span>
      </div>
    </section>
  );
}
