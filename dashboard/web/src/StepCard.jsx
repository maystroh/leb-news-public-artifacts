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
  const logRef = useRef(null);

  useEffect(() => {
    if (running) setShowLog(true);
  }, [running]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log, showLog]);

  const hasLog = log && log.length > 0;

  return (
    <div className={`card status-${step.status}`}>
      <div className="card-head">
        <span className={`badge badge-${step.status}`}>{STATUS_LABELS[step.status] || step.status}</span>
        <h2>{step.title}</h2>
      </div>
      <p className="description">{step.description}</p>
      {step.statusDetail && <p className={`status-detail detail-${step.status}`}>{step.statusDetail}</p>}

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

      <div className="card-actions">
        {step.actions.map((action, index) => (
          <button
            key={action.id}
            className={index === 0 ? 'btn primary' : 'btn'}
            disabled={busy}
            onClick={() => onRun(action.id)}
          >
            {running && index === 0 ? 'Running…' : action.label}
          </button>
        ))}
        {onReview && step.status !== 'done' && (
          <button className="btn primary" onClick={() => onReview(true)}>
            Mark reviewed
          </button>
        )}
        {onReview && step.status === 'done' && (
          <button className="btn" onClick={() => onReview(false)}>
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
