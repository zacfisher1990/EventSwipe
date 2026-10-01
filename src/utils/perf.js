/**
 * Cold-start instrumentation.
 *
 * Records performance.now() marks at each boundary of the launch path and logs
 * the delta from the previous mark plus the total since JS bundle evaluation.
 *
 * Marks are idempotent by default: the first call for a given name wins. That
 * keeps the timeline pinned to the cold start — later re-renders, background
 * refreshes and filter changes call the same code paths but will not overwrite
 * the launch numbers. Pass { repeat: true } for marks you want to see every time.
 *
 * Purely observational — nothing here changes app behaviour.
 */

const nowMs = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

// T0: evaluated when this module is first imported. index.js imports it before
// App, so this is effectively "start of our JS", ahead of the app module graph.
const T0 = nowMs();

const marks = new Map(); // name -> { at, sinceStart, sincePrev, detail }
const order = [];
let lastAt = T0;

const fmt = (ms) => `${ms.toFixed(1)}ms`;

export const perfMark = (name, detail, { repeat = false } = {}) => {
  if (!__DEV__) return 0;
  if (!repeat && marks.has(name)) return marks.get(name).at;

  const at = nowMs();
  const sinceStart = at - T0;
  const sincePrev = at - lastAt;
  lastAt = at;

  const entry = { at, sinceStart, sincePrev, detail };
  if (!marks.has(name)) order.push(name);
  marks.set(name, entry);

  console.log(
    `[perf] ${name.padEnd(30)} +${fmt(sincePrev).padStart(9)}   T+${fmt(sinceStart)}` +
      (detail !== undefined ? `   ${JSON.stringify(detail)}` : '')
  );

  return at;
};

/** Duration between two previously recorded marks, or null if either is missing. */
export const perfSpan = (fromName, toName) => {
  const from = marks.get(fromName);
  const to = marks.get(toName);
  if (!from || !to) return null;
  return to.at - from.at;
};

/**
 * Approximates "painted" rather than "committed": rAF fires before the next
 * frame is drawn, so a second rAF lands after that frame has gone out.
 */
export const perfMarkAfterPaint = (name, detail) => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => perfMark(name, detail));
  });
};

/** Dump the whole timeline as one table. Call once the first card is on screen. */
export const perfSummary = (label = 'cold start') => {
  if (!__DEV__) return;
  const lines = order.map((name) => {
    const { sinceStart, sincePrev, detail } = marks.get(name);
    return (
      `  ${name.padEnd(30)} +${fmt(sincePrev).padStart(9)}   T+${fmt(sinceStart).padStart(9)}` +
      (detail !== undefined ? `   ${JSON.stringify(detail)}` : '')
    );
  });

  console.log(
    [
      ``,
      `[perf] ===== ${label} timeline (T0 = perf module eval) =====`,
      `  ${'mark'.padEnd(30)} ${'delta'.padStart(10)}   ${'total'.padStart(11)}`,
      ...lines,
      `[perf] ===== end =====`,
      ``,
    ].join('\n')
  );
};

export const perfMarks = () => order.map((name) => ({ name, ...marks.get(name) }));
