(() => {
  'use strict';

  const BADGE_ATTR = 'data-lc-solved-badge';

  // ===== Config (easy to tweak) =====
  // “优先”判断：当前是 <1600 的 TODO 题。后续你只需要改这里即可（例如改成 1700）。
  const PRIORITY_RATING_THRESHOLD = 1600;

  function bgFetchIndex({ forceRefresh } = {}) {
    return new Promise((resolve, reject) => {
      debugLog('sendMessage LC_FETCH_INDEX', { forceRefresh: !!forceRefresh });
      chrome.runtime.sendMessage(
        { type: 'LC_FETCH_INDEX', forceRefresh: !!forceRefresh },
        (resp) => {
          const err = chrome.runtime.lastError;
          if (err) {
            debugLog('sendMessage error', err.message);
            return reject(new Error(err.message));
          }
          if (!resp?.ok) {
            debugLog('background responded error', resp);
            return reject(new Error(resp?.error || 'background fetch failed'));
          }
          debugLog('background responded ok', {
            savedAt: resp?.data?.savedAt, sizes: {
              slugToStatus: resp?.data?.slugToStatus?.length,
              idToStatus: resp?.data?.idToStatus?.length,
            }
          });
          resolve(resp.data);
        }
      );
    });
  }

  const QUERY_PROBLEMSET_LIST_V2 = `
query problemsetQuestionListV2($filters: QuestionFilterInput, $limit: Int, $searchKeyword: String, $skip: Int, $sortBy: QuestionSortByInput, $categorySlug: String) {
  problemsetQuestionListV2(
    filters: $filters
    limit: $limit
    searchKeyword: $searchKeyword
    skip: $skip
    sortBy: $sortBy
    categorySlug: $categorySlug
  ) {
    questions {
      titleSlug
      questionFrontendId
      status
    }
    hasMore
  }
}
`;

  function defaultFilters() {
    return {
      filterCombineType: 'ALL',
      statusFilter: { questionStatuses: [], operator: 'IS' },
      difficultyFilter: { difficulties: [], operator: 'IS' },
      languageFilter: { languageSlugs: [], operator: 'IS' },
      topicFilter: { topicSlugs: [], operator: 'IS' },
      acceptanceFilter: {},
      frequencyFilter: {},
      frontendIdFilter: {},
      lastSubmittedFilter: {},
      publishedFilter: {},
      companyFilter: { companySlugs: [], operator: 'IS' },
      positionFilter: { positionSlugs: [], operator: 'IS' },
      positionLevelFilter: { positionLevelSlugs: [], operator: 'IS' },
      contestPointFilter: { contestPoints: [], operator: 'IS' },
      premiumFilter: { premiumStatus: [], operator: 'IS' },
    };
  }

  const CACHE_KEY = 'lc_status_index_v1';
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

  function serializeIndex({ slugToStatus, idToStatus }) {
    return {
      slugToStatus: Array.from(slugToStatus.entries()),
      idToStatus: Array.from(idToStatus.entries()),
    };
  }

  function deserializeIndex(obj) {
    const slugToStatus = new Map(obj?.slugToStatus || []);
    const idToStatus = new Map(obj?.idToStatus || []);
    return { slugToStatus, idToStatus };
  }

  function loadIndexFromCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.savedAt || !parsed?.data) return null;
      if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
      return deserializeIndex(parsed.data);
    } catch {
      return null;
    }
  }

  function saveIndexToCache(index) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          data: serializeIndex(index),
        })
      );
    } catch {
      // ignore
    }
  }

  async function fetchAllQuestionsIndex({ forceRefresh = false } = {}) {
    if (!forceRefresh) {
      const cached = loadIndexFromCache();
      if (cached) return cached;
    }

    const data = await bgFetchIndex({ forceRefresh });
    const index = deserializeIndex(data);
    saveIndexToCache(index);
    return index;
  }

  function debugLog(...args) {
    // Toggle by running in DevTools: localStorage.setItem('lc_marker_debug','1')
    if (localStorage.getItem('lc_marker_debug') === '1') {
      console.log('[leetcode-discuss-solved-marker]', ...args);
    }
  }

  const RATING_CACHE_KEY = 'lc_rating_index_v1';
  const RATING_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function loadRatingIndexFromCache() {
    try {
      const raw = localStorage.getItem(RATING_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.savedAt || !parsed?.data) return null;
      if (Date.now() - parsed.savedAt > RATING_CACHE_TTL_MS) return null;
      return new Map(parsed.data);
    } catch {
      return null;
    }
  }

  function saveRatingIndexToCache(map) {
    try {
      localStorage.setItem(
        RATING_CACHE_KEY,
        JSON.stringify({ savedAt: Date.now(), data: Array.from(map.entries()) })
      );
    } catch {
      // ignore
    }
  }

  async function fetchRatingIndex({ forceRefresh = false } = {}) {
    if (!forceRefresh) {
      const cached = loadRatingIndexFromCache();
      if (cached) return cached;
    }

    const res = await fetch('https://zerotrac.github.io/leetcode_problem_rating/data.json', {
      method: 'GET',
      credentials: 'omit',
    });
    if (!res.ok) throw new Error(`rating data HTTP ${res.status}`);
    const arr = await res.json();
    const map = new Map();
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const slug = item?.TitleSlug;
        const rating = item?.Rating;
        if (slug && Number.isFinite(Number(rating))) {
          map.set(String(slug), Math.round(Number(rating)));
        }
      }
    }
    saveRatingIndexToCache(map);
    return map;
  }

  const RATING_ATTR = 'data-lc-rating';

  function hasInlineRatingAfterTitle(li, a) {
    const full = (li.textContent || '').replace(/\s+/g, ' ').trim();
    const title = ((a.textContent || '').trim() || '').replace(/\s+/g, ' ');
    const afterTitle = title && full.startsWith(title) ? full.slice(title.length) : full;

    // Only treat a 4-digit number as an inline rating when it appears at the end
    // (or right before a closing punctuation). This avoids false positives like:
    // "... 最少的后缀翻转次数 同 3192 题".
    return /\b\d{4}\b\s*[)）】\]】」』”"'’]*\s*$/.test(afterTitle);
  }

  function insertWeakRatingAfterAnchor(li, a, rating) {
    if (!a || !li) return;
    if (li.querySelector(`span[${RATING_ATTR}="1"]`)) return;

    const span = document.createElement('span');
    span.setAttribute(RATING_ATTR, '1');
    span.textContent = ` ${rating}`;
    span.style.color = '#6e7781';
    span.style.fontSize = '16px';
    span.style.marginLeft = '3px';
    span.style.fontWeight = '400';

    a.insertAdjacentElement('afterend', span);
  }

  function insertWeakRatingAtLineEnd(li, rating) {
    if (!li) return;
    if (li.querySelector(`span[${RATING_ATTR}="1"]`)) return;

    const span = document.createElement('span');
    span.setAttribute(RATING_ATTR, '1');
    span.textContent = ` ${rating}`;
    span.style.color = '#6e7781';
    span.style.fontSize = '16px';
    span.style.marginLeft = '3px';
    span.style.fontWeight = '400';

    li.appendChild(span);
  }

  function extractFromAnchor(a) {
    if (!a) return null;

    const href = a.getAttribute('href') || '';
    const m = href.match(/\/problems\/([^/?#]+)(?:\/|$)/);

    const t = (a.textContent || '').trim();
    const n = t.match(/^(\d+)\s*[\.\s、-]/);
    const frontendId = n ? n[1] : '';

    if (m) return { type: 'slug', slug: m[1], frontendId };
    if (frontendId) return { type: 'id', id: frontendId };

    return null;
  }

  function extractFromLi(li) {
    const a = li.querySelector('a[href*="/problems/"]');
    if (!a) return null;
    return extractFromAnchor(a);
  }

  // 题单里可能自带“会员题”文字，这里不额外标记/处理会员题

  function makeBadge(kind, { emphasize = false } = {}) {
    const span = document.createElement('span');
    span.setAttribute(BADGE_ATTR, '1');
    span.style.marginLeft = '8px';
    span.style.padding = '0 6px';
    span.style.borderRadius = '10px';
    span.style.fontSize = '12px';
    span.style.border = '1px solid transparent';
    span.style.verticalAlign = 'middle';

    if (kind === 'done') {
      span.textContent = '✅ 已完成';
      span.style.color = '#1a7f37';
      span.style.borderColor = '#1a7f37';
    } else if (kind === 'tried') {
      span.textContent = '🟠 尝试过';
      span.style.color = '#b36b00';
      span.style.borderColor = '#b36b00';
    } else {
      span.textContent = '❌ 未完成';
      span.style.color = '#cf222e';
      span.style.borderColor = '#cf222e';
    }

    if (emphasize) {
      span.style.fontWeight = '700';
      span.style.fontSize = '13px';
      span.style.padding = '1px 8px';
      span.style.borderWidth = '2px';
      span.style.boxShadow = '0 0 0 2px rgba(207,34,46,0.12)';
    }

    return span;
  }

  function isPremiumLi(li) {
    const text = (li.textContent || '').toLowerCase();
    // 题单常见写法：会员题 / Premium / 🔒 / lock
    return text.includes('会员') || text.includes('premium') || text.includes('🔒') || text.includes('lock');
  }

  const SUMMARY_ATTR = 'data-lc-status-summary';

  function ensureSummaryEl() {
    let el = document.querySelector(`div[${SUMMARY_ATTR}="1"]`);
    if (el) return el;

    el = document.createElement('div');
    el.setAttribute(SUMMARY_ATTR, '1');
    el.style.position = 'fixed';
    el.style.right = '16px';
    el.style.bottom = '16px';
    el.style.zIndex = '2147483647';
    el.style.background = 'rgba(255, 255, 255, 0.92)';
    el.style.border = '1px solid rgba(0,0,0,0.12)';
    el.style.borderRadius = '10px';
    el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
    el.style.padding = '10px 12px';
    el.style.fontSize = '12px';
    el.style.lineHeight = '1.6';
    el.style.color = '#24292f';
    el.style.backdropFilter = 'blur(6px)';
    el.style.pointerEvents = 'auto';

    // 有些页面 renderSummary 触发时 body 还没准备好
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function renderSummary(counts, { onRefresh } = {}) {
    // 防止在 body 未就绪时偶现创建失败
    if (!document.body && document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => renderSummary(counts, { onRefresh }), { once: true });
      return;
    }
    const entries = [
      [`🔥 优先（<${PRIORITY_RATING_THRESHOLD}）`, counts.priority || 0],
      ['❌ 未完成', counts.todo || 0],
      ['🟠 尝试过', counts.tried || 0],
      ['✅ 已完成', counts.done || 0],
      ['其它', counts.other || 0],
    ].filter(([, n]) => n > 0);

    const el = ensureSummaryEl();
    if (!entries.length) {
      el.style.display = 'none';
      return;
    }

    el.style.display = '';
    el.innerHTML =
      entries.map(([label, n]) => `<div>${label}：<b>${n}</b></div>`).join('') +
      `<div style="margin-top:8px; text-align:right;">
        <button type="button" data-lc-refresh="1" style="cursor:pointer; padding:4px 8px; font-size:12px; border-radius:8px; border:1px solid rgba(0,0,0,0.15); background:#fff;">刷新</button>
      </div>`;

    const btn = el.querySelector('button[data-lc-refresh="1"]');
    if (btn && typeof onRefresh === 'function') {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onRefresh();
      };
    }
  }

  function markListItems(root, statusIndex, { ratingIndex } = {}) {
    const counts = { done: 0, tried: 0, todo: 0, other: 0, priority: 0 };

    const lis = root.querySelectorAll('li');
    for (const li of lis) {
      const a = li.querySelector('a[href*="/problems/"]');
      if (!a) continue;

      // 会员题：不标记 badge，但整行变暗（与已完成类似）；同时也尽量补一个弱色分数
      if (isPremiumLi(li)) {
        li.style.opacity = '0.3';

        // If the page doesn't provide an inline rating, inject one from zerotrac.
        if (ratingIndex && !hasInlineRatingAfterTitle(li, a)) {
          const key = extractFromLi(li);
          const slug = key?.type === 'slug' ? key.slug : '';
          const r = slug ? ratingIndex.get(slug) : null;
          if (typeof r === 'number' && Number.isFinite(r)) {
            insertWeakRatingAtLineEnd(li, r);
          }
        }
        continue;
      }

      const key = extractFromLi(li);
      if (!key) continue;

      const existed = li.querySelector(`span[${BADGE_ATTR}="1"]`);
      if (existed) {
        const text = existed.textContent || '';
        const kind = text.includes('已完成') ? 'done' : text.includes('尝试过') ? 'tried' : text.includes('未完成') ? 'todo' : 'other';

        // 已经有标记时也要统计 priority（因为 badge 可能是之前 run 添加的）
        let emphasize = false;
        if (kind === 'todo') {
          const full = (li.textContent || '').replace(/\s+/g, ' ').trim();
          const title = ((a.textContent || '').trim() || '').replace(/\s+/g, ' ');
          const afterTitle = title && full.startsWith(title) ? full.slice(title.length) : full;
          // Treat a 4-digit number as rating only if it is at the end (avoid "同 3192 题")
          const m = afterTitle.match(/\b(\d{4})\b\s*[)）】\]】」』”"'’]*\s*$/);
          const rating = m ? Number(m[1]) : NaN;
          emphasize = Number.isFinite(rating) && rating < PRIORITY_RATING_THRESHOLD;

          // 原页面没分数，但如果我们已经补过淡色分数，也要计入 priority
          if (!emphasize) {
            const injected = li.querySelector(`span[${RATING_ATTR}="1"]`);
            const injectedRating = injected ? Number(String(injected.textContent || '').trim()) : NaN;
            if (Number.isFinite(injectedRating) && injectedRating < PRIORITY_RATING_THRESHOLD) emphasize = true;
          }
        }

        if (kind === 'done') li.style.opacity = '0.3';
        counts[kind] += 1;
        if (emphasize) counts.priority += 1;
        continue;
      }

      let status = '';
      if (key.type === 'slug') status = statusIndex.slugToStatus.get(key.slug) || '';
      if (!status && key.frontendId) status = statusIndex.idToStatus.get(String(key.frontendId)) || '';

      const s = String(status || '').toUpperCase();
      const kind = s === 'SOLVED' ? 'done' : s === 'ATTEMPTED' ? 'tried' : s === 'TO_DO' || !s ? 'todo' : 'other';

      if (kind === 'done') li.style.opacity = '0.3';

      // discuss 列表里标题后面可能跟一个 4 位难度分（例如："... </a> 2057"）。
      // 若原页面没有分数，则从 zerotrac data.json 用 TitleSlug 补一个“淡色分数”。
      let emphasize = false;
      if (kind === 'todo') {
        const full = (li.textContent || '').replace(/\s+/g, ' ').trim();
        const title = ((a.textContent || '').trim() || '').replace(/\s+/g, ' ');
        let afterTitle = title && full.startsWith(title) ? full.slice(title.length) : full;

        // Treat a 4-digit number as rating only if it is at the end (avoid "同 3192 题")
        let m = afterTitle.match(/\b(\d{4})\b\s*[)）】\]】」』”"'’]*\s*$/);
        let rating = m ? Number(m[1]) : NaN;

        if (!Number.isFinite(rating)) {
          const key = extractFromLi(li);
          const slug = key?.type === 'slug' ? key.slug : '';
          const r = slug && ratingIndex ? ratingIndex.get(slug) : null;
          if (typeof r === 'number' && Number.isFinite(r)) {
            insertWeakRatingAfterAnchor(li, a, r);
            rating = r;
            afterTitle = `${afterTitle} ${r}`;
          }
        }

        emphasize = Number.isFinite(rating) && rating < PRIORITY_RATING_THRESHOLD;
      }

      counts[kind] += 1;
      if (emphasize) counts.priority += 1;
      li.appendChild(makeBadge(kind, { emphasize }));
    }

    renderSummary(counts, { onRefresh: () => run({ forceRefresh: true }) });
  }

  let zerotracLastKey = '';

  function markZerotracTable(root, statusIndex) {
    const counts = { done: 0, tried: 0, todo: 0, other: 0 };

    // zerotrac 使用 element-plus table
    const tables = root.querySelectorAll('table.el-table__body');
    if (!tables.length) {
      debugLog('zerotrac tables', 0);
      return;
    }

    // 如果当前页可见的题目 ID 列没变，则不重复做 DOM 操作（防抖/降耗）
    const firstTable = tables[0];
    const ids = [];
    for (const tr of firstTable.querySelectorAll('tbody tr.el-table__row')) {
      const firstCell = tr.querySelector('td:first-child .cell');
      const idText = (firstCell?.textContent || '').trim();
      if (idText) ids.push(idText);
    }

    // 只有在能取到 ids 时才做短路判断，避免空 key 误判导致翻页不刷新
    if (ids.length) {
      const pageKey = ids.join('|');
      if (pageKey === zerotracLastKey) return;
      zerotracLastKey = pageKey;
    }

    for (const table of tables) {
      const rows = table.querySelectorAll('tbody tr.el-table__row');
      for (const tr of rows) {
        const tds = tr.querySelectorAll('td');
        if (!tds.length) continue;

        const idCell = tds[0];
        if (!idCell) continue;

        const idCellInner = idCell.querySelector('.cell') || idCell;

        // 翻页/排序时会重绘数据：先清掉旧标记再按当前行数据重新打标
        for (const old of idCellInner.querySelectorAll(`span[${BADGE_ATTR}="1"]`)) {
          old.remove();
        }

        // 题目链接在第二列，但这里直接全行找 leetcode problems 链接
        const a = tr.querySelector('a[href^="https://leetcode.cn/problems/"]');
        if (!a) {
          debugLog('row missing problem link');
          continue;
        }

        const key = extractFromAnchor(a);
        if (!key) {
          debugLog('row extract failed', a.getAttribute('href'));
          continue;
        }

        let status = '';
        if (key.type === 'slug') status = statusIndex.slugToStatus.get(key.slug) || '';
        if (!status && key.frontendId) status = statusIndex.idToStatus.get(String(key.frontendId)) || '';

        const s = String(status || '').toUpperCase();
        const kind = s === 'SOLVED' ? 'done' : s === 'ATTEMPTED' ? 'tried' : s === 'TO_DO' || !s ? 'todo' : 'other';

        // 翻页/排序时会复用 row 节点：每次都按当前状态重设 opacity
        tr.style.opacity = kind === 'done' ? '0.3' : '';

        counts[kind] += 1;
        idCellInner.appendChild(makeBadge(kind));
      }
    }

    // Only log summary when debugging and there is something to show.
    if (localStorage.getItem('lc_marker_debug') === '1') {
      debugLog('zerotrac counts', counts);
    }
    renderSummary(counts, { onRefresh: () => run({ forceRefresh: true }) });
  }

  function isZerotracPage() {
    return location.host === 'zerotrac.github.io' && location.pathname.startsWith('/leetcode_problem_rating');
  }

  async function run({ forceRefresh = false } = {}) {
    const statusIndex = await fetchAllQuestionsIndex({ forceRefresh });
    const ratingIndex = isZerotracPage() ? null : await fetchRatingIndex({ forceRefresh: false }).catch(() => null);

    const mark = () => {
      if (isZerotracPage()) {
        // element-plus 翻页/排序会复用 table 并重绘 tbody；每次都按当前页重算并重打标
        markZerotracTable(document, statusIndex);
      } else {
        markListItems(document, statusIndex, { ratingIndex });
      }
    };

    mark();

    // zerotrac 首屏可能异步渲染：仅在“还未出现表格行”时短暂轮询，出现后立刻停止。
    if (isZerotracPage()) {
      let left = 30; // ~6s
      const timer = setInterval(() => {
        if (document.querySelector('table.el-table__body tbody tr.el-table__row')) {
          clearInterval(timer);
          return;
        }
        mark();
        left -= 1;
        if (left <= 0) clearInterval(timer);
      }, 200);

      window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
    }

    let t = null;
    const mo = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(mark, 100);
    });

    if (isZerotracPage()) {
      // element-plus 翻页/排序时，tbody 可能整体替换；监听表格容器更可靠
      const tableRoot = document.querySelector('.el-table');
      const target = tableRoot || document.querySelector('table.el-table__body') || document.documentElement;
      mo.observe(target, { childList: true, subtree: true });

      // 同时监听分页器点击（有些实现翻页不触发明显的 DOM mutation）
      document.addEventListener(
        'click',
        (e) => {
          const el = e.target;
          if (!(el instanceof Element)) return;
          if (el.closest('.el-pagination')) {
            clearTimeout(t);
            t = setTimeout(mark, 50);
          }
        },
        true
      );
    } else {
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  run().catch((err) => console.error('[leetcode-discuss-solved-marker]', err));
})();
