const DEFAULTS = {
  datasetUrl: 'https://zerotrac.github.io/leetcode_problem_rating/data.json',
  cacheTtlDays: 7,
  enableFallback: true
};

const STORAGE_KEYS = {
  ratingMap: 'ratingMap',
  lastFetchedAt: 'lastFetchedAt'
};

function nowMs() {
  return Date.now();
}

function ttlMs(days) {
  return days * 24 * 60 * 60 * 1000;
}

async function getOptions() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return {
    datasetUrl: stored.datasetUrl || DEFAULTS.datasetUrl,
    cacheTtlDays: Number(stored.cacheTtlDays || DEFAULTS.cacheTtlDays),
    enableFallback: Boolean(stored.enableFallback)
  };
}

async function getCache() {
  const { ratingMap, lastFetchedAt } = await chrome.storage.local.get({
    [STORAGE_KEYS.ratingMap]: null,
    [STORAGE_KEYS.lastFetchedAt]: 0
  });

  return {
    ratingMap: ratingMap || null,
    lastFetchedAt: Number(lastFetchedAt || 0)
  };
}

async function setCache({ ratingMap, lastFetchedAt }) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.ratingMap]: ratingMap,
    [STORAGE_KEYS.lastFetchedAt]: lastFetchedAt
  });
}

function normalizeDatasetToMap(json) {
  // We accept a few common shapes to be resilient.
  // Expected: array of { slug, rating }.
  if (Array.isArray(json)) {
    const map = Object.create(null);
    for (const row of json) {
      if (!row) continue;
      const slug = row.slug || row.titleSlug || row.TitleSlug || row.url_slug;
      const rating = row.rating ?? row.elo ?? row.Rating ?? row.difficulty;
      const r = Number(rating);
      if (slug && Number.isFinite(r)) map[String(slug)] = r;
    }
    return map;
  }

  // Or object keyed by slug: { [slug]: rating|{rating} }
  if (json && typeof json === 'object') {
    const map = Object.create(null);
    for (const [k, v] of Object.entries(json)) {
      if (!k) continue;
      if (typeof v === 'number') {
        if (Number.isFinite(v)) map[k] = v;
      } else if (v && typeof v === 'object') {
        const r = Number(v.rating ?? v.elo);
        if (Number.isFinite(r)) map[k] = r;
      }
    }
    return map;
  }

  return Object.create(null);
}

async function fetchAndCacheDataset() {
  const opts = await getOptions();
  const res = await fetch(opts.datasetUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Dataset fetch failed: ${res.status}`);

  const json = await res.json();
  const ratingMap = normalizeDatasetToMap(json);

  await setCache({ ratingMap, lastFetchedAt: nowMs() });
  return ratingMap;
}

async function ensureFreshMap() {
  const opts = await getOptions();
  const cache = await getCache();
  const fresh = cache.ratingMap && nowMs() - cache.lastFetchedAt < ttlMs(opts.cacheTtlDays);
  if (fresh) return cache.ratingMap;
  return await fetchAndCacheDataset();
}

chrome.runtime.onInstalled.addListener(async () => {
  // Set up periodic refresh.
  const opts = await getOptions();
  chrome.alarms.create('refreshDataset', { periodInMinutes: Math.max(60, opts.cacheTtlDays * 24 * 60) });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'refreshDataset') return;
  try {
    await fetchAndCacheDataset();
  } catch {
    // ignore; we'll retry on demand
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'getRating') {
      const { slug } = msg;
      const map = await ensureFreshMap();
      const rating = slug && map ? map[slug] : undefined;
      sendResponse({ rating: Number.isFinite(rating) ? rating : null });
      return;
    }

    if (msg.type === 'getOptions') {
      const opts = await getOptions();
      sendResponse(opts);
      return;
    }

    if (msg.type === 'refreshDataset') {
      try {
        await fetchAndCacheDataset();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      return;
    }
  })();

  return true; // keep message channel open for async response
});
