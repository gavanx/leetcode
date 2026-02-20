function getSlugFromLocation() {
  const m = location.pathname.match(/^\/problems\/([^/]+)\/description\/?/);
  return m ? m[1] : null;
}

function findDifficultyEl(root = document) {
  return (
    root.querySelector('.text-difficulty-easy') ||
    root.querySelector('.text-difficulty-medium') ||
    root.querySelector('.text-difficulty-hard')
  );
}

function getDifficultyFromEl(el) {
  if (!el) return null;
  const cls = el.className || '';
  if (String(cls).includes('text-difficulty-easy')) return 'easy';
  if (String(cls).includes('text-difficulty-medium')) return 'medium';
  if (String(cls).includes('text-difficulty-hard')) return 'hard';
  return null;
}

function estimateRating({ difficulty, titleText, bodyText }) {
  let base = 1700;
  if (difficulty === 'easy') base = 1300;
  else if (difficulty === 'medium') base = 1700;
  else if (difficulty === 'hard') base = 2200;

  const text = `${titleText || ''}\n${bodyText || ''}`.toLowerCase();

  const bumps = [
    { re: /\bsegment\s*tree\b/, add: 350 },
    { re: /\bsuffix\b/, add: 300 },
    { re: /\bautomaton\b/, add: 350 },
    { re: /\bmin[- ]cost\b|\bmin cost\b/, add: 250 },
    { re: /\bflow\b|\bmax flow\b|\bmin cut\b/, add: 400 },
    { re: /\bgraph\b|\bdfs\b|\bbfs\b/, add: 120 },
    { re: /\bdp\b|dynamic programming/, add: 180 },
    { re: /\bbitmask\b|\bstate compression\b/, add: 250 },
    { re: /\bgeometry\b/, add: 250 },
    { re: /\btrie\b/, add: 200 }
  ];

  let bonus = 0;
  for (const b of bumps) if (b.re.test(text)) bonus = Math.max(bonus, b.add);

  const rating = Math.round(base + bonus);
  return Math.max(800, rating);
}

function ensureBadge(difficultyEl) {
  if (!difficultyEl) return null;

  const parent = difficultyEl.parentElement;
  if (!parent) return null;

  let badge = parent.querySelector('.lc-rating-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'lc-rating-badge';
    badge.textContent = '[...]';
    difficultyEl.insertAdjacentElement('afterend', badge);
  }
  return badge;
}

async function updateRatingUI() {
  const slug = getSlugFromLocation();
  if (!slug) return;

  const diffEl = findDifficultyEl();
  if (!diffEl) return;

  const badge = ensureBadge(diffEl);
  if (!badge) return;

  let rating = null;
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'getRating', slug });
    rating = resp?.rating ?? null;
  } catch {
    rating = null;
  }

  if (Number.isFinite(rating)) {
    badge.textContent = `[${Math.round(rating)}]`;
    badge.dataset.estimated = '0';
    return;
  }

  // fallback heuristic
  let enableFallback = true;
  try {
    const opts = await chrome.runtime.sendMessage({ type: 'getOptions' });
    enableFallback = Boolean(opts?.enableFallback);
  } catch {
    enableFallback = true;
  }

  if (!enableFallback) {
    badge.textContent = '[N/A]';
    badge.dataset.estimated = '0';
    return;
  }

  const difficulty = getDifficultyFromEl(diffEl);
  const titleText = document.title;
  const bodyText = document.body?.innerText || '';
  const est = estimateRating({ difficulty, titleText, bodyText });
  badge.textContent = `[est ${est}]`;
  badge.dataset.estimated = '1';
}

function installObservers() {
  let lastSlug = null;

  const tick = () => {
    const slug = getSlugFromLocation();
    const diffEl = findDifficultyEl();
    if (!slug || !diffEl) return;

    if (slug !== lastSlug) {
      lastSlug = slug;
      updateRatingUI();
      return;
    }

    // Same slug, but SPA might re-render difficulty element
    const badge = diffEl.parentElement?.querySelector('.lc-rating-badge');
    if (!badge) updateRatingUI();
  };

  const mo = new MutationObserver(() => tick());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Also respond to SPA navigation (pushState/replaceState)
  const wrapHistory = (type) => {
    const orig = history[type];
    history[type] = function (...args) {
      const ret = orig.apply(this, args);
      window.dispatchEvent(new Event('lc-locationchange'));
      return ret;
    };
  };
  wrapHistory('pushState');
  wrapHistory('replaceState');
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('lc-locationchange')));
  window.addEventListener('lc-locationchange', () => {
    lastSlug = null;
    tick();
  });

  tick();
}

installObservers();
