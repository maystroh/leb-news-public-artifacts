// The Quote Duel flow lives on its own page so duel work can be
// iterated without touching the main briefing dashboard. This is the single list
// the main page filters out and the duel page filters in — keep it in sync with
// the duel step ids in dashboard/steps.mjs.
export const DUEL_STEP_IDS = [
  'duel-hooks',
  'duel-text',
  'duel-audio',
  'duel-html',
  'duel-hooks-sync',
  'duel-server-render',
  'duel-server-mux',
  'duel-download',
  'duel-split'
];

export const DUEL_STEP_SET = new Set(DUEL_STEP_IDS);

// Steps that must appear on BOTH pages (not subtracted by the main filter).
export const SHARED_STEP_IDS = ['social-package'];
export const SHARED_STEP_SET = new Set(SHARED_STEP_IDS);

// Link to the duel page (new tab), carrying the current date through.
export function duelHref(date) {
  const params = new URLSearchParams({view: 'duel'});
  if (date) params.set('date', date);
  return `/?${params.toString()}`;
}
