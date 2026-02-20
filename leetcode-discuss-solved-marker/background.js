(() => {
  'use strict';

  const GRAPHQL_URL = 'https://leetcode.cn/graphql/';

  function getCookieFromHeader(setCookieHeaders, name) {
    // Not used; kept minimal.
    return '';
  }

  async function gql({ query, variables, operationName }) {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query, variables, operationName }),
    });

    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    return json.data;
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

  async function loadIndexFromCache() {
    const { [CACHE_KEY]: raw } = await chrome.storage.local.get(CACHE_KEY);
    if (!raw) return null;
    if (!raw?.savedAt || !raw?.data) return null;
    if (Date.now() - raw.savedAt > CACHE_TTL_MS) return null;
    return deserializeIndex(raw.data);
  }

  async function saveIndexToCache(index) {
    await chrome.storage.local.set({
      [CACHE_KEY]: {
        savedAt: Date.now(),
        data: serializeIndex(index),
      },
    });
  }

  async function fetchAllQuestionsIndexFromNetwork() {
    const limit = 100;
    let skip = 0;

    const slugToStatus = new Map();
    const idToStatus = new Map();

    for (;;) {
      const data = await gql({
        operationName: 'problemsetQuestionListV2',
        query: QUERY_PROBLEMSET_LIST_V2,
        variables: {
          skip,
          limit,
          categorySlug: '',
          filters: defaultFilters(),
          searchKeyword: '',
          sortBy: { sortField: 'CUSTOM', sortOrder: 'ASCENDING' },
        },
      });

      const page = data?.problemsetQuestionListV2;
      const questions = page?.questions || [];

      for (const q of questions) {
        if (q?.titleSlug) slugToStatus.set(q.titleSlug, q.status || '');
        if (q?.questionFrontendId) idToStatus.set(String(q.questionFrontendId), q.status || '');
      }

      if (!page?.hasMore) break;
      skip += limit;
    }

    const index = { slugToStatus, idToStatus };
    await saveIndexToCache(index);
    return index;
  }

  async function fetchAllQuestionsIndex({ forceRefresh = false } = {}) {
    if (!forceRefresh) {
      const cached = await loadIndexFromCache();
      if (cached) return cached;
    }
    return fetchAllQuestionsIndexFromNetwork();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'LC_FETCH_INDEX') return;

    (async () => {
      const index = await fetchAllQuestionsIndex({ forceRefresh: !!msg.forceRefresh });
      sendResponse({
        ok: true,
        data: serializeIndex(index),
      });
    })().catch((err) => {
      sendResponse({ ok: false, error: String(err?.message || err) });
    });

    return true; // async
  });

  // MV3 service worker may be suspended; keep console output minimal but helpful.
  console.log('[leetcode-discuss-solved-marker] service worker ready');
})();
