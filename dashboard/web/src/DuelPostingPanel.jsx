import React, {useState} from 'react';

async function copyText(text, setCopied, key) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  setCopied(key);
  window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
}

export default function DuelPostingPanel({social, onUploadPhoneScenes, onDeletePhoneFolder}) {
  const [copied, setCopied] = useState(null);
  const [phonePassword, setPhonePassword] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(null);
  const [phoneMessage, setPhoneMessage] = useState(null);

  const phone = social?.phone || {};
  const phoneCopied = phone.status === 'copied';
  const copiedTime = phone.copiedAt ? new Date(phone.copiedAt).toLocaleString() : null;
  const clashes = social?.clashes || social?.shorts || [];

  const uploadToPhone = async () => {
    setPhoneBusy('upload');
    setPhoneMessage(null);
    try {
      const result = await onUploadPhoneScenes({password: phonePassword});
      setPhoneMessage({type: 'done', text: `Uploaded ${result.fileCount} file(s) to ${result.remoteFolder}.`});
    } catch (err) {
      setPhoneMessage({type: 'error', text: err.message});
    } finally {
      setPhoneBusy(null);
    }
  };

  const deleteFromPhone = async () => {
    if (!window.confirm(`Delete ${phone.remoteFolder} from the phone?`)) return;
    setPhoneBusy('delete');
    setPhoneMessage(null);
    try {
      const result = await onDeletePhoneFolder({password: phonePassword});
      setPhoneMessage({type: 'done', text: `Deleted ${result.remoteFolder} from the phone.`});
    } catch (err) {
      setPhoneMessage({type: 'error', text: err.message});
    } finally {
      setPhoneBusy(null);
    }
  };

  return (
    <section className="social-panel">
      <div className="social-panel-head">
        <div>
          <h2>Post Quote Duel</h2>
          <p className="description">Use the full muxed video, or publish one clash at a time with the matching caption.</p>
        </div>
        <div className="platform-links">
          <a className="btn" href="https://www.instagram.com" target="_blank" rel="noreferrer">
            Instagram Reels
          </a>
          <a className="btn" href="https://studio.youtube.com" target="_blank" rel="noreferrer">
            YouTube Shorts
          </a>
          <a className="btn" href="https://www.tiktok.com/upload" target="_blank" rel="noreferrer">
            TikTok
          </a>
        </div>
      </div>

      {!social?.ready && (
        <p className="hint warn">
          Duel captions not generated yet (run the Social captions step).
        </p>
      )}

      <div className="publish-grid">
        {social?.full && (
          <div className="publish-card">
            <div className="publish-card-head">
              <h3>Full (all duels)</h3>
              <div className="story-actions">
                {social.full.url && (
                  <a className="btn" href={social.full.url} target="_blank" rel="noreferrer">
                    Open MP4
                  </a>
                )}
                {social.full.copyPath && (
                  <button className="btn" onClick={() => copyText(social.full.copyPath, setCopied, 'full-path')}>
                    {copied === 'full-path' ? 'Copied' : 'Copy path'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="publish-card">
          <div className="publish-card-head">
            <h3>Per-clash videos</h3>
          </div>
          <div className="story-list">
            {clashes.map((short, index) => (
              <div className="story-row" key={`${short.duelId}-${short.fileName}`}>
                <div className="story-meta">
                  <strong>{String(index + 1).padStart(2, '0')}. {short.outlet || short.duelId}</strong>
                  <span>{short.fileName || 'Prompt ready; video not downloaded yet'}</span>
                </div>
                <div className="story-actions">
                  {short.url && (
                    <a className="btn" href={short.url} target="_blank" rel="noreferrer">
                      Open clip
                    </a>
                  )}
                  {short.copyPath && (
                    <button className="btn" onClick={() => copyText(short.copyPath, setCopied, `short-path-${index}`)}>
                      {copied === `short-path-${index}` ? 'Copied' : 'Copy path'}
                    </button>
                  )}
                  {short.copyText && (
                    <button className="btn primary" onClick={() => copyText(short.copyText, setCopied, `short-${index}`)}>
                      {copied === `short-${index}` ? 'Copied' : 'Copy caption'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!clashes.length && (
              <p className="hint">No per-clash videos yet — run the per-clash video step.</p>
            )}
          </div>
          <div className="phone-transfer">
            <div>
              <strong>Phone transfer</strong>
              <p className="hint">
                {phone.user}@{phone.host}:{phone.port} → {phone.remoteFolder}
              </p>
              <p className={`phone-status ${phoneCopied ? 'done' : 'pending'}`}>
                {phoneCopied
                  ? `Copied to phone${copiedTime ? ` at ${copiedTime}` : ''}${phone.fileCount ? ` (${phone.fileCount} files)` : ''}.`
                  : 'Not copied to phone yet.'}
              </p>
            </div>
            <div className="phone-transfer-controls">
              <input
                type="password"
                value={phonePassword}
                onChange={(event) => setPhonePassword(event.target.value)}
                placeholder="Phone password"
                autoComplete="current-password"
              />
              <button className="btn primary" disabled={phoneBusy || phoneCopied || !clashes.length} onClick={uploadToPhone}>
                {phoneBusy === 'upload' ? 'Uploading…' : 'Upload folder'}
              </button>
              <button className="btn ghost danger" disabled={phoneBusy || !phoneCopied} onClick={deleteFromPhone}>
                {phoneBusy === 'delete' ? 'Deleting…' : 'Delete phone folder'}
              </button>
            </div>
            {phoneMessage && <p className={`phone-message ${phoneMessage.type}`}>{phoneMessage.text}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
