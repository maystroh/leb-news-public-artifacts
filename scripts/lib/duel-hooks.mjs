// Default attention-hook variants for the Quote Duel video path. These are
// generic TikTok-style openers (reusable day to day), NOT per-duel content.
// build-briefing-folder injects them into quote-duel.json when the upstream
// file carries no `hooks` of its own, so every day has a stable, selectable set
// (hook-2 is always "بتعرف شو عم بقولو..."). A Codex-authored quote-duel.json may
// override by emitting its own `hooks` array.
export const DEFAULT_DUEL_HOOKS = [
  {id: 'hook-1', text: 'اليوم شو عم بقولوا للبنانية'},
  {id: 'hook-2', text: 'بتعرف شو عم بقولو للشعب اللبناني اليوم؟ مشِّي معي ورح قلك...'},
  {id: 'hook-3', text: 'اسمع اسمع هل الخبرية بالصحف اليوم'}
];

// Which hook variant the pipeline uses by default (dashboard + docs). The user
// is testing hook-2 for now; the hook strategy is still open.
export const DEFAULT_HOOK_ID = 'hook-2';

// Normalize a duel doc's hooks: keep its own non-empty `hooks` (or legacy single
// `hook`), otherwise fall back to the defaults. Returns a fresh array.
export const ensureDuelHooks = (quoteDuel) => {
  if (Array.isArray(quoteDuel?.hooks) && quoteDuel.hooks.some((h) => h?.text)) {
    return quoteDuel.hooks
      .filter((h) => h?.text)
      .map((h, i) => ({id: h.id ?? `hook-${i + 1}`, text: h.text}));
  }
  if (quoteDuel?.hook?.text) return [{id: 'hook-1', text: quoteDuel.hook.text}];
  return DEFAULT_DUEL_HOOKS.map((h) => ({...h}));
};
