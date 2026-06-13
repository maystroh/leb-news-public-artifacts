import React, {useEffect, useRef, useState} from 'react';

const STATUS_LABELS = {
  done: 'Done',
  failed: 'Failed',
  running: 'Running…',
  pending: 'Pending',
  stale: 'Stale',
  attention: 'Needs attention'
};

function formatMtime(mtimeMs) {
  if (!mtimeMs) return '';
  const d = new Date(mtimeMs);
  return d.toLocaleString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
}

export default function StepCard({step, log, busy, running, onRun, onReview}) {
  const [showLog, setShowLog] = useState(false);
  const [optionSelections, setOptionSelections] = useState({});
  const logRef = useRef(null);

  useEffect(() => {
    if (running) setShowLog(true);
  }, [running]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log, showLog]);

  const hasLog = log && log.length > 0;
  const locked = Boolean(step.locked);

  const selectedFor = (action) =>
    optionSelections[action.id] ?? action.options?.defaultSelected ?? [];

  const toggleOption = (action, value) => {
    const current = selectedFor(action);
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    setOptionSelections((prev) => ({...prev, [action.id]: next}));
  };

  const runAction = (action) => {
    if (!action.options) return onRun(action.id);
    onRun(action.id, {[action.options.id]: selectedFor(action)});
  };

  return (
    <div className={`card status-${step.status}${locked ? ' card-locked' : ''}`}>
      <div className="card-head">
        <span className={`badge badge-${step.status}`}>{STATUS_LABELS[step.status] || step.status}</span>
        <h2>{step.title}</h2>
        {locked && <span className="lock-chip">🔒 Locked</span>}
      </div>
      <p className="description">{step.description}</p>
      {step.statusDetail && <p className={`status-detail detail-${step.status}`}>{step.statusDetail}</p>}
      {locked && step.lockReason && <p className="lock-note">{step.lockReason}</p>}

      {step.artifacts.length > 0 && (
        <ul className="artifacts">
          {step.artifacts.map((artifact) => (
            <li key={artifact.label} className={artifact.exists ? 'present' : 'missing'}>
              <span className="mark">{artifact.exists ? '✓' : artifact.optional ? '·' : '✗'}</span>
              {artifact.url ? (
                <a href={artifact.url} target="_blank" rel="noreferrer">
                  {artifact.label}
                </a>
              ) : (
                <span>{artifact.label}</span>
              )}
              {artifact.exists && <span className="mtime">{formatMtime(artifact.mtimeMs)}</span>}
            </li>
          ))}
        </ul>
      )}

      {step.actions.filter((action) => action.options).map((action) => (
        <div key={`${action.id}-options`} className="action-options">
          <span className="action-options-label">{action.options.label}:</span>
          {action.options.choices.map((choice) => (
            <label key={choice.value} className="action-option">
              <input
                type="checkbox"
                checked={selectedFor(action).includes(choice.value)}
                disabled={busy || locked}
                onChange={() => toggleOption(action, choice.value)}
              />
              {choice.label}
            </label>
          ))}
        </div>
      ))}

      <div className="card-actions">
        {step.actions.map((action, index) => (
          <button
            key={action.id}
            className={index === 0 ? 'btn primary' : 'btn'}
            disabled={busy || locked || (action.options && selectedFor(action).length === 0)}
            onClick={() => runAction(action)}
          >
            {running && index === 0 ? 'Running…' : action.label}
          </button>
        ))}
        {onReview && step.status !== 'done' && (
          <button className="btn primary" disabled={locked} onClick={() => onReview(true)}>
            Mark reviewed
          </button>
        )}
        {onReview && step.status === 'done' && (
          <button className="btn" disabled={locked} onClick={() => onReview(false)}>
            Unmark review
          </button>
        )}
        {hasLog && (
          <button className="btn ghost" onClick={() => setShowLog((value) => !value)}>
            {showLog ? 'Hide log' : `Show log (${log.length})`}
          </button>
        )}
        {step.lastRun?.finishedAt && (
          <span className="last-run">
            last run: {step.lastRun.status} · {new Date(step.lastRun.finishedAt).toLocaleString()}
          </span>
        )}
      </div>

      {showLog && hasLog && (
        <pre className="log" ref={logRef}>
          {log.join('\n')}
        </pre>
      )}
    </div>
  );
}
