const DEFAULTS = {
  datasetUrl: 'https://zerotrac.github.io/leetcode_problem_rating/data.json',
  cacheTtlDays: 7,
  enableFallback: true
};

async function getOptions() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return {
    datasetUrl: stored.datasetUrl || DEFAULTS.datasetUrl,
    cacheTtlDays: Number(stored.cacheTtlDays || DEFAULTS.cacheTtlDays),
    enableFallback: Boolean(stored.enableFallback)
  };
}

async function setOptions(opts) {
  await chrome.storage.sync.set(opts);
}

function $(id) {
  return document.getElementById(id);
}

function setStatus(text) {
  const el = $('status');
  el.textContent = text;
  if (text) setTimeout(() => (el.textContent = ''), 1500);
}

async function load() {
  const opts = await getOptions();
  $('datasetUrl').value = opts.datasetUrl;
  $('cacheTtlDays').value = String(opts.cacheTtlDays);
  $('enableFallback').checked = opts.enableFallback;
}

async function save() {
  const datasetUrl = $('datasetUrl').value.trim() || DEFAULTS.datasetUrl;
  const cacheTtlDays = Math.max(1, Number($('cacheTtlDays').value || DEFAULTS.cacheTtlDays));
  const enableFallback = $('enableFallback').checked;

  await setOptions({ datasetUrl, cacheTtlDays, enableFallback });
  setStatus('Saved');
}

async function refreshNow() {
  await chrome.runtime.sendMessage({ type: 'refreshDataset' });
  setStatus('Refresh requested');
}

document.addEventListener('DOMContentLoaded', async () => {
  await load();

  $('save').addEventListener('click', async () => {
    await save();
  });

  $('refresh').addEventListener('click', async () => {
    await refreshNow();
  });
});
