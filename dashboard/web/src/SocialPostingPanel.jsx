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

export default function SocialPostingPanel({social}) {
  const [copied, setCopied] = useState(null);
  const [variantIndex, setVariantIndex] = useState(0);

  const variants = social?.variants || [];
  const active = variants[variantIndex] || variants[0] || null;
  const youtube = social?.youtube || {};

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
      </div>
    </section>
  );
}
