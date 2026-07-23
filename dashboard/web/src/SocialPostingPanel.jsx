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
  const x = social?.x || {};
  const xPosts = x.posts || [];

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
          <a className="btn" href={x.accountUrl || 'https://x.com/RadarBeirut'} target="_blank" rel="noreferrer">
            Post now X
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
            <h3>X thread</h3>
            <div className="story-actions">
              <a className="btn" href={x.accountUrl || 'https://x.com/RadarBeirut'} target="_blank" rel="noreferrer">
                Open X
              </a>
            </div>
          </div>
          {xPosts.length > 0 && (
            <p className="hint">
              Chain, top to bottom: publish the hook, then each next box replies to the post directly above it (never to post 1) — that keeps it one “Show this thread” unit.
            </p>
          )}
          {xPosts.map((post, index) => (
            <div className="x-thread-post" key={post.id || index}>
              <label>{post.label || `Post ${index + 1}`}</label>
              {post.hint && <p className="hint">{post.hint}</p>}
              <textarea readOnly value={post.text || ''} />
              <button className="btn primary" onClick={() => copyText(post.copyText || post.text, setCopied, `x-${index}`)}>
                {copied === `x-${index}` ? 'Copied' : `Copy ${post.label || `post ${index + 1}`}`}
              </button>
              {(post.poll || []).length > 0 && (
                <div className="x-poll-options">
                  <label>Poll options — X blocks polls in replies; post a standalone evening poll (question text + these options, 1 day)</label>
                  {post.poll.map((option, optionIndex) => (
                    <div className="copy-row" key={optionIndex}>
                      <input readOnly value={option} />
                      <button
                        className="btn"
                        onClick={() => copyText(option, setCopied, `x-${index}-poll-${optionIndex}`)}
                      >
                        {copied === `x-${index}-poll-${optionIndex}` ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {xPosts.length > 1 && (
            <button className="btn" onClick={() => copyText(x.copyText, setCopied, 'x-all')}>
              {copied === 'x-all' ? 'Copied' : 'Copy full X thread'}
            </button>
          )}
          {!xPosts.length && <p className="hint warn">X thread is missing. Run step 16: Generate social captions.</p>}
        </div>
      </div>
    </section>
  );
}
