(() => {
  'use strict';

  // 通过 SVG path 的 d 值识别“已完成”图标
  const DONE_PATH_D =
    'M21.6 12a9.6 9.6 0 01-9.6 9.6 9.6 9.6 0 110-19.2c1.507 0 2.932.347 4.2.965M19.8 6l-8.4 8.4L9 12';

  // 命中的 path 往上找第 5 级父元素作为“行”
  const ROW_PARENT_LEVELS = 5;


  function getAncestor(el, levels) {
    let cur = el;
    for (let i = 0; i < levels && cur; i++) cur = cur.parentElement;
    return cur || null;
  }


  function applyFilter(root = document) {
    const paths = root.querySelectorAll(`path[d="${CSS.escape(DONE_PATH_D)}"]`);
    for (const p of paths) {
      const row = getAncestor(p, ROW_PARENT_LEVELS);
      if (!row) continue;
      row.style.setProperty('display', 'none', 'important');
    }
  }

  applyFilter();

  // 清理历史残留的筛选面板（如果之前注入过）
  const oldPanel = document.getElementById('lc-filter-panel');
  if (oldPanel) oldPanel.remove();

  let t = null;
  const mo = new MutationObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => applyFilter(), 50);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
