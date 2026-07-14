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
  const covers = social?.covers || [];
  const uploadableCount = (social?.full?.url ? 1 : 0) + clashes.filter((item) => item.url).length + covers.filter((item) => item.url).length;

  const uploadToPhone = async () => {
    setPhoneBusy('upload');
    setPhoneMessage(null);
    try {
      const result = await onUploadPhoneScenes({password: phonePassword});
      setPhoneMessage({
        type: 'done',
        text: `Uploaded ${result.fileCount} file(s) to ${result.remoteFolder}: ${result.clipCount || 0} MP4, ${result.coverCount || 0} PNG.`
      });
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
          <p className="description">Use the full muxed video, or publish one clash at a time with the matching caption step in the dashboard.</p>
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
            <p className="file-path">{social.full.path}</p>
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

          <div className="story-list asset-list">
            <div className="publish-card-head compact">
              <h3>PNG covers</h3>
            </div>
            {covers.map((cover, index) => (
              <div className="story-row" key={cover.path || cover.fileName}>
                <div className="story-meta">
                  <strong>{String(index + 1).padStart(2, '0')}. {cover.fileName}</strong>
                  <span>{cover.path}</span>
                </div>
                <div className="story-actions">
                  {cover.url && (
                    <a className="btn" href={cover.url} target="_blank" rel="noreferrer">
                      Open PNG
                    </a>
                  )}
                  {cover.copyPath && (
                    <button className="btn" onClick={() => copyText(cover.copyPath, setCopied, `cover-path-${index}`)}>
                      {copied === `cover-path-${index}` ? 'Copied' : 'Copy path'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!covers.length && (
              <p className="hint">No Quote Duel PNG covers found yet — generate the reel cover images from step 25 prompts.</p>
            )}
          </div>
          <div className="phone-transfer">
            <div>
              <strong>Phone transfer</strong>
              <p className="hint">
                Uploads the muxed MP4, per-clash MP4s, and Quote Duel PNG covers from this date's output folder.
                <br />
                {phone.user}@{phone.host}:{phone.port} → {phone.remoteFolder}
                {phone.curlInterface ? ` · via ${phone.curlInterface}` : ''}
              </p>
              <p className={`phone-status ${phoneCopied ? 'done' : 'pending'}`}>
                {phoneCopied
                  ? `Copied to phone${copiedTime ? ` at ${copiedTime}` : ''}${phone.fileCount ? ` (${phone.fileCount} files: ${phone.clipCount || 0} MP4, ${phone.coverCount || 0} PNG)` : ''}.`
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
              <button className="btn primary" disabled={phoneBusy || phoneCopied || uploadableCount === 0} onClick={uploadToPhone}>
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
