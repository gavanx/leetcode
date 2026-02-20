(() => {
  'use strict';

  const PANEL_ID = 'lc-example-testgen-panel';

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function getDescriptionRoot() {
    // Prefer the main description region. If LeetCode changes DOM, fall back to document.
    return (
      $('[data-track-load="description_content"]') ||
      $('[data-cy="question-detail-description"]') ||
      document
    );
  }

  function normalizeLine(s) {
    return (s || '').replace(/\u00a0/g, ' ').trim();
  }

  function findExampleHeaders(root) {
    const strongs = Array.from(root.querySelectorAll('strong'));
    return strongs.filter((s) => /^\s*"?示例\s*\d+\s*[:：]\s*"?\s*$/.test(s.textContent || ''));
  }

  function nextNonEmptyElementSibling(el) {
    let cur = el ? el.nextElementSibling : null;
    while (cur && normalizeLine(cur.textContent) === '') cur = cur.nextElementSibling;
    return cur;
  }

  function collectTextLines(container) {
    if (!container) return [];

    // Prefer innerText to preserve line breaks in code/pre blocks.
    const blocks = Array.from(
      container.querySelectorAll('p, pre, li, div, span, code')
    );
    if (blocks.length === 0) return [normalizeLine(container.innerText || container.textContent)];

    const lines = [];
    for (const el of blocks) {
      const t = normalizeLine(el.innerText || el.textContent);
      if (!t) continue;
      lines.push(t);
    }
    return lines;
  }

  function parseExamples(root) {
    const headers = findExampleHeaders(root);
    const examples = [];

    for (const h of headers) {
      const p = h.closest('p');
      const container = nextNonEmptyElementSibling(p);
      if (!container) continue;

      const containerText = normalizeLine(container.innerText || container.textContent);
      if (!containerText) continue;

      // Old CN problem pages often render the whole example in a single block like:
      // "输入：... 输出：... 解释：..." (no <strong>输入</strong>/<strong>输出</strong> markers).
      // Newer pages might still have <strong>输入:</strong> / <strong>输出:</strong>.
      const m = containerText.match(/输入[:：]\s*([\s\S]*?)\s*输出[:：]\s*([\s\S]*?)(?:\s*解释[:：][\s\S]*)?$/);
      if (m) {
        const input = stripLeadingLabel(m[1]);
        const output = stripLeadingLabel(m[2]);
        if (input && output) examples.push({ input, output });
        continue;
      }

      const inputParts = [];
      const outputParts = [];

      // Parse by walking nodes in order: when we see strong "输入:" collect following text until strong "输出:".
      let mode = null;
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode;
        if (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'STRONG') {
          const t = normalizeLine(n.textContent);
          if (/^"?输入[:：]"?$/.test(t)) {
            mode = 'in';
            continue;
          }
          if (/^"?输出[:：]"?$/.test(t)) {
            mode = 'out';
            continue;
          }
          if (/^"?解释[:：]"?$/.test(t)) {
            mode = null;
            continue;
          }
        }

        if (n.nodeType === Node.TEXT_NODE) {
          const t = normalizeLine(n.nodeValue);
          if (!t) continue;
          if (mode === 'in') inputParts.push(t);
          else if (mode === 'out') outputParts.push(t);
        }
      }

      const input = stripLeadingLabel(inputParts.join(' '));
      const output = stripLeadingLabel(outputParts.join(' '));
      if (!input || !output) continue;

      examples.push({ input, output });
    }

    return examples;
  }

  function splitTopLevelComma(s) {
    const parts = [];
    let cur = '';
    let quote = null;
    let escape = false;
    let depth = 0;

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (escape) {
        cur += ch;
        escape = false;
        continue;
      }
      if (ch === '\\') {
        cur += ch;
        escape = true;
        continue;
      }
      if (quote) {
        cur += ch;
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        cur += ch;
        quote = ch;
        continue;
      }
      if (ch === '[' || ch === '{' || ch === '(') {
        cur += ch;
        depth++;
        continue;
      }
      if (ch === ']' || ch === '}' || ch === ')') {
        cur += ch;
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (ch === ',' && depth === 0) {
        parts.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  }

  function stripLeadingLabel(s) {
    // Handle cases where extracted text still contains labels like "输入:" / "输出:".
    let t = normalizeLine(String(s || '').replace(/^\s*"?(输入|输出)\s*[:：]\s*"?/u, ''));
    // Some CN pages include stray quotes at the end (e.g. MMMD...IX").
    t = t.replace(/^"+/, '').replace(/"+$/, '');
    return t;
  }

  function parseInputToArgs(input) {
    // Examples usually look like: "s = \"III\"" or "x = 1, y = 2".
    // Return an array of JS expressions as strings.
    const trimmed = stripLeadingLabel(input);
    if (!trimmed) return [];

    const parts = splitTopLevelComma(trimmed);
    const args = [];
    for (const p of parts) {
      const m = p.match(/^\s*([\w\u4e00-\u9fa5]+)\s*=\s*(.+?)\s*$/);
      let expr = (m ? m[2] : p).trim();

      // Some pages drop the trailing quote when DOM text is extracted,
      // e.g. s = "Hello World  -> expr becomes "Hello World
      // If it starts with a quote but doesn't end with the same quote, patch it.
      if (
        (expr.startsWith('"') && !expr.endsWith('"')) ||
        (expr.startsWith("'") && !expr.endsWith("'"))
      ) {
        expr += expr[0];
      }

      args.push(expr);
    }
    return args;
  }

  function guessFunctionName() {
    // Prefer extracting from the right editor content.
    // 1) Monaco DOM (often used on LC): a visible line may contain
    //    `var merge = function(nums1, m, nums2, n) {`
    const monacoLine = document.querySelector('.monaco-mouse-cursor-text');
    if (monacoLine) {
      const t = normalizeLine(monacoLine.textContent);
      if (t) {
        let m = t.match(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*function\s*\(/);
        if (m) return m[1];
        m = t.match(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/);
        if (m) return m[1];
      }
    }

    // 2) Textbox editor (LC CN often exposes full code in textarea/[role=textbox]).
    const editorTextBox = document.querySelector('textarea, [role="textbox"]');
    if (editorTextBox) {
      const code = normalizeLine(editorTextBox.value || editorTextBox.textContent);
      if (code) {
        // JS
        let m = code.match(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*function\s*\(/);
        if (m) return m[1];
        m = code.match(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/);
        if (m) return m[1];
        // TS/JS method style inside class/obj
        m = code.match(/\b([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/);
        if (m) return m[1];
        // C++ / Java
        m = code.match(/\b(?:int|long|double|float|string|String|boolean|bool|void)\s+([A-Za-z_$][\w$]*)\s*\(/);
        if (m) return m[1];
      }
    }

    // Fallback: scan description <code> blocks.
    const root = getDescriptionRoot();
    const codes = Array.from(root.querySelectorAll('code'));
    for (const c of codes) {
      const t = normalizeLine(c.textContent);
      const m = t.match(/\b([A-Za-z_$][\w$]*)\s*\(/);
      if (m) return m[1];
    }

    return 'solve';
  }

  function coerceExpected(outputRaw) {
    // Keep as-is if it looks like JSON/JS literals.
    const t = stripLeadingLabel(outputRaw);
    if (/^-?\d+(\.\d+)?$/.test(t)) return t;
    if (/^(true|false|null)$/.test(t)) return t;
    if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}')))
      return t;

    // For outputs like MMMDCCXLIX (no quotes in statement), treat as string.
    return normalizeJsStringLiteral(t);
  }

  function normalizeJsStringLiteral(s) {
    // Ensure a valid JS string literal (double-quoted) and escape internal quotes/backslashes.
    return JSON.stringify(stripLeadingLabel(s));
  }

  function generateTests(examples, fnName) {
    const lines = [];

    lines.push(`
      
      `);
    lines.push(`function __lcRunExamples(fn, cases) {`);
    lines.push(`  for (let i = 0; i < cases.length; i++) {`);
    lines.push(`    const { args, expected, comment } = cases[i];`);
    lines.push(`    if (comment) console.log(comment);`);
    lines.push(`    try {`);
    lines.push(`      const got = fn(...args);`);
    lines.push(`      const gotOut = Array.isArray(got) ? got.join() : got;`);
    lines.push(`      const expectedOut = Array.isArray(expected) ? expected.join() : expected;`);
    lines.push(`      const ok = gotOut === expectedOut;`);
    lines.push(
      "      const color = ok ? 'color: #16a34a; font-weight: 700;' : 'color: #dc2626; font-weight: 700;';"
    );
    lines.push(
      "      console.log(`%c${i + 1} ${ok ? 'OK' : 'FAIL'}`, color, { got: gotOut, expected: expectedOut });"
    );
    lines.push(`    } catch (e) {`);
    lines.push(
      "      console.log(`%c${i + 1} ERROR`, 'color: #dc2626; font-weight: 700;', { error: String(e) }); throw e;"
    );
    lines.push(`    }`);
    lines.push(`  }`);
    lines.push(`}`);
    lines.push('');

    lines.push('const __lcExamples = [');
    examples.forEach((ex) => {
      const args = parseInputToArgs(ex.input);
      const expected = coerceExpected(ex.output);
      const comment = `// 输入：${ex.input}  输出：${ex.output}`;
      lines.push(`  { args: [${args.join(', ')}], expected: ${expected}, comment: ${JSON.stringify(comment)} },`);
    });
    lines.push('];');
    lines.push('');
    lines.push(`__lcRunExamples(${fnName}, __lcExamples);`);

    return lines.join('\n');
  }

  function ensurePanel() {
    const old = document.getElementById(PANEL_ID);
    if (old) old.remove();

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText =
      'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#111;color:#fff;padding:10px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.35);font:12px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial;max-width:320px;';

    const title = document.createElement('div');
    title.textContent = 'LC Example TestGen';
    title.style.cssText = 'font-weight:600;margin-bottom:6px;';

    const btn = document.createElement('button');
    btn.textContent = 'Generate to console';
    btn.style.cssText =
      'background:#2f7; border:0; padding:6px 8px; border-radius:6px; cursor:pointer; font-weight:600;';

    const hint = document.createElement('div');
    hint.textContent = 'Open DevTools console, then click.';
    hint.style.cssText = 'opacity:.8;margin-top:6px;';

    btn.addEventListener('click', async () => {
      const root = getDescriptionRoot();
      const examples = parseExamples(root);
      const fnName = guessFunctionName();
      const code = generateTests(examples, fnName);

      try {
        await navigator.clipboard.writeText(code);
        hint.textContent = 'Copied to clipboard. Paste into your local runner.';
      } catch {
        hint.textContent = 'Clipboard blocked. Copied code printed to console.';
        console.log(code);
      }
    });

    panel.appendChild(title);
    panel.appendChild(btn);
    panel.appendChild(hint);

    document.documentElement.appendChild(panel);
  }

  ensurePanel();
})();
