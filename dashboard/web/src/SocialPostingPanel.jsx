import React, {useState} from 'react';

function joinHashtags(tags) {
  return Array.isArray(tags) ? tags.join(' ') : '';
}

async function copyText(text, setCopied, key) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  setCopied(key);
  window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
}

export default function SocialPostingPanel({social, onUploadPhoneScenes, onDeletePhoneFolder}) {
  const [copied, setCopied] = useState(null);
  const [variantIndex, setVariantIndex] = useState(0);
  const [phonePassword, setPhonePassword] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(null);
  const [phoneMessage, setPhoneMessage] = useState(null);

  const variants = social.variants || [];
  const active = variants[variantIndex] || variants[0] || null;
  const youtube = social.youtube || {};
  const instagram = social.instagram || {};
  const phone = social.phone || {};
  const phoneCopied = phone.status === 'copied';
  const copiedTime = phone.copiedAt ? new Date(phone.copiedAt).toLocaleString() : null;

  const uploadToPhone = async () => {
    setPhoneBusy('upload');
    setPhoneMessage(null);
    try {
      const result = await onUploadPhoneScenes({mid: active?.mid || '', password: phonePassword});
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
          <h2>Post now</h2>
          <p className="description">Manual upload shortcuts: open the platform, paste the file path, copy the exact text.</p>
        </div>
        <div className="platform-links">
          <a className="btn" href="https://studio.youtube.com" target="_blank" rel="noreferrer">
            YouTube Studio
          </a>
          <a className="btn" href="https://www.instagram.com" target="_blank" rel="noreferrer">
            Instagram
          </a>
        </div>
        {variants.length > 1 && (
          <select value={variantIndex} onChange={(event) => setVariantIndex(Number(event.target.value))}>
            {variants.map((variant, index) => (
              <option key={variant.label} value={index}>
                {variant.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {!social?.ready && (
        <p className="hint warn">
          Social text is not ready yet. Run step 16: Generate social captions.
        </p>
      )}

      <div className="publish-grid">
        <div className="publish-card">
          <div className="publish-card-head">
            <h3>YouTube full video</h3>
            <div className="story-actions">
              {active?.fullVideo?.url && (
                <a className="btn" href={active.fullVideo.url} target="_blank" rel="noreferrer">
                  Open MP4
                </a>
              )}
              {active?.fullVideo?.copyPath && (
                <button className="btn" onClick={() => copyText(active.fullVideo.copyPath, setCopied, 'yt-path')}>
                  {copied === 'yt-path' ? 'Copied' : 'Copy path'}
                </button>
              )}
            </div>
          </div>
          <label>Title</label>
          <div className="copy-row">
            <input readOnly value={youtube.title || ''} />
            <button className="btn" onClick={() => copyText(youtube.title, setCopied, 'yt-title')}>
              {copied === 'yt-title' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <label>Description + hashtags</label>
          <textarea readOnly value={[youtube.description || '', joinHashtags(youtube.hashtags)].filter(Boolean).join('\n\n')} />
          <button className="btn primary" onClick={() => copyText(youtube.copyText, setCopied, 'yt-all')}>
            {copied === 'yt-all' ? 'Copied' : 'Copy YouTube text'}
          </button>
          {active?.fullVideo?.path && <p className="file-path">{active.fullVideo.path}</p>}
        </div>

        <div className="publish-card">
          <div className="publish-card-head">
            <h3>Instagram story clips</h3>
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
              <button className="btn primary" disabled={phoneBusy || phoneCopied || !active} onClick={uploadToPhone}>
                {phoneBusy === 'upload' ? 'Uploading…' : 'Upload folder'}
              </button>
              <button className="btn ghost danger" disabled={phoneBusy || !phoneCopied} onClick={deleteFromPhone}>
                {phoneBusy === 'delete' ? 'Deleting…' : 'Delete phone folder'}
              </button>
            </div>
            {phoneMessage && <p className={`phone-message ${phoneMessage.type}`}>{phoneMessage.text}</p>}
            {instagram.coverImage ? (
              <p className="hint">Reel cover included: {instagram.coverImage.path}</p>
            ) : (
              <p className="hint warn">Reel cover image not found yet: save it as output/instagram-reel-cover.png to include it in phone upload.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
