import React, {useEffect, useRef, useState} from 'react';

const fmt = (seconds) => (seconds == null ? '—' : `${seconds.toFixed(1)}s`);

function RegenBadge({regen}) {
  if (!regen) return null;
  if (regen.verdict === 'failed') return <span className="badge badge-failed">regen failed</span>;
  if (regen.verdict === 'longer')
    return (
      <span className="badge badge-stale" title="New WAV is longer than the old one — re-render the muted video before muxing.">
        longer — re-render needed
      </span>
    );
  if (regen.verdict === 'ok')
    return (
      <span className="badge badge-done" title="Same length or shorter — re-running the mux is enough.">
        regenerated — re-mux ok
      </span>
    );
  if (regen.verdict === 'new') return <span className="badge badge-done">generated</span>;
  return null;
}

function SceneRow({entry, busy, regenerating, log, onRegenerate, onSaveText}) {
  const [draft, setDraft] = useState(entry.effectiveText);
  const [saving, setSaving] = useState(false);
  const logRef = useRef(null);

  // Refresh the editor when server state changes (save, regenerate, rebuild),
  // but never while the user has unsaved local edits.
  const dirty = draft.trim() !== entry.effectiveText.trim();
  useEffect(() => {
    if (!dirty) setDraft(entry.effectiveText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.effectiveText]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const save = async () => {
    setSaving(true);
    try {
      await onSaveText(entry.sceneId, draft);
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    setDraft(entry.defaultText);
    setSaving(true);
    try {
      await onSaveText(entry.sceneId, '');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`scene-row ${entry.textMismatch ? 'mismatch' : ''}`}>
      <div className="scene-row-head">
        <span className="mono scene-id">{entry.sceneId}</span>
        <span className="rtl outlet-name">
          {entry.outletName || (entry.segmentType !== 'scene' ? entry.segmentType : '')}
        </span>
        {entry.isOverridden && <span className="badge badge-attention">edited script</span>}
        {entry.textMismatch && (
          <span className="badge badge-stale" title="The existing WAV was generated from different text than the current script.">
            WAV outdated
          </span>
        )}
        <RegenBadge regen={entry.regen} />
        <span className="scene-row-spacer" />
        <span className="mono duration">{fmt(entry.wavDurationSeconds)}</span>
        {entry.url ? (
          <audio controls preload="none" src={entry.url} />
        ) : (
          <span className="missing">no WAV yet</span>
        )}
        <button
          className="btn"
          disabled={busy || dirty}
          title={dirty ? 'Save the text first' : entry.wavExists ? 'Back up the WAV and regenerate this scene from the current text' : 'Generate this scene from the current text'}
          onClick={() => {
            if (
              window.confirm(
                `${entry.wavExists ? 'Regenerate' : 'Generate'} narration for ${entry.sceneId} from the current script text?` +
                  (entry.wavExists ? '\n\nThe current WAV is backed up, then timings resync and outputs rebuild.' : '')
              )
            ) {
              onRegenerate(entry.sceneId);
            }
          }}
        >
          {regenerating ? 'Working…' : entry.wavExists ? 'Regenerate' : 'Generate scene'}
        </button>
      </div>

      <textarea
        className="rtl script-editor"
        rows={Math.min(8, Math.max(2, Math.ceil(draft.length / 110)))}
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
            Reset to briefing text
          </button>
        )}
        {dirty && <span className="hint">Unsaved — Hamsa still uses the previous text.</span>}
        {!dirty && entry.textMismatch && <span className="hint warn">Saved text differs from the WAV — regenerate to apply.</span>}
      </div>

      {regenerating && log.length > 0 && (
        <pre className="log" ref={logRef}>
          {log.join('\n')}
        </pre>
      )}
    </div>
  );
}

export default function AudioPanel({entries, busy, activeSceneId, log, onRegenerate, onSaveText}) {
  if (!entries.length) {
    return (
      <section className="audio-panel">
        <h2>Scene narration audio</h2>
        <p className="empty">No narration script yet — build the outputs first (step 6).</p>
      </section>
    );
  }

  const hasAnyWav = entries.some((entry) => entry.wavExists);

  return (
    <section className="audio-panel">
      <h2>Scene narration audio</h2>
      <p className="description">
        This is the exact text Hamsa will read per scene{hasAnyWav ? '' : ' when you run step 7'}. Edit and save any scene
        before generating — edits are stored in <code>audio/text-overrides.json</code> and survive rebuilds. After
        generation, listen to each scene here and regenerate it individually.
      </p>
      {entries.map((entry) => (
        <SceneRow
          key={entry.sceneId}
          entry={entry}
          busy={busy}
          regenerating={activeSceneId === entry.sceneId}
          log={activeSceneId === entry.sceneId ? log : []}
          onRegenerate={onRegenerate}
          onSaveText={onSaveText}
        />
      ))}
    </section>
  );
}
