import * as path from 'path';
import * as vscode from 'vscode';

const RECENTLY_HANDLED = new Map<string, number>();
const RECENTLY_HANDLED_TTL_MS = 2_000;

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('copyToSeq');
  return {
    enabled: cfg.get<boolean>('enabled', true),
    start: cfg.get<number>('start', 1),
    debug: cfg.get<boolean>('debug', false),
    pattern: cfg.get<string>('pattern', '-copy'), // kept for backward compat (unused)
  };
}

const COPY_SUFFIX_RE = /(?:-copy| copy(?: \d+)?| copy\(\d+\))$/;

function stripCopySuffix(nameWithoutExt: string): string | undefined {
  if (!COPY_SUFFIX_RE.test(nameWithoutExt)) return undefined;
  return nameWithoutExt.replace(COPY_SUFFIX_RE, '');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function splitTrailingNumber(baseName: string): { stem: string; n?: number } {
  const m = baseName.match(/^(.*?)-(\d+)$/);
  if (!m) return { stem: baseName };
  const n = Number(m[2]);
  if (!Number.isFinite(n)) return { stem: baseName };
  return { stem: m[1], n };
}

async function findNextNumberedTarget(
  dir: vscode.Uri,
  baseName: string,
  ext: string,
  start: number
): Promise<vscode.Uri> {
  const safeStart = Number.isFinite(start) && start > 0 ? Math.floor(start) : 1;
  const { stem } = splitTrailingNumber(baseName);

  // If the source already has a trailing number (e.g. foo-2-copy), start from the larger
  // of (that number + 1) and the next available number in the directory.
  let maxExisting = 0;
  try {
    const entries = await vscode.workspace.fs.readDirectory(dir);
    const re = new RegExp(`^${escapeRegExp(stem)}-(\\d+)${escapeRegExp(ext)}$`);
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File) continue;
      const m = name.match(re);
      if (!m) continue;
      const num = Number(m[1]);
      if (Number.isFinite(num) && num > maxExisting) maxExisting = num;
    }
  } catch {
    // ignore
  }

  const first = maxExisting > 0 ? maxExisting + 1 : safeStart;

  for (let i = first; ; i++) {
    const fileName = `${stem}-${i}${ext}`;
    const candidate = dir.with({ path: path.posix.join(dir.path, fileName) });
    if (!(await uriExists(candidate))) return candidate;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('CopyToSeq');
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');

  watcher.onDidCreate(async (uri) => {
    // Renames triggered immediately on create can race with the paste/copy operation.
    // Retry a few times before giving up.
    const { enabled, start, debug } = getConfig();
    const log = (msg: string) => {
      if (debug) output.appendLine(`[${new Date().toISOString()}] ${msg}`);
    };

    log(`onDidCreate: ${uri.fsPath}`);

    if (!enabled) {
      log('skip: disabled');
      return;
    }

    // Only handle workspace files.
    if (!vscode.workspace.getWorkspaceFolder(uri)) {
      log('skip: not in workspace');
      return;
    }

    const sourcePath = uri.fsPath;
    const now = Date.now();
    const last = RECENTLY_HANDLED.get(sourcePath);
    if (last !== undefined && now - last < RECENTLY_HANDLED_TTL_MS) {
      log('skip: recently handled');
      return;
    }

    const parsed = path.parse(sourcePath);
    const nameWithoutExt = parsed.name;
    const ext = parsed.ext;

    const baseName = stripCopySuffix(nameWithoutExt);
    if (baseName === undefined) {
      log(`skip: no copy suffix match (name=${nameWithoutExt})`);
      return;
    }
    if (!baseName) {
      log(`skip: empty base name after stripping (name=${nameWithoutExt})`);
      return;
    }

    const dirUri = vscode.Uri.file(parsed.dir);
    try {
      RECENTLY_HANDLED.set(sourcePath, Date.now());

      for (let attempt = 0; attempt < 10; attempt++) {
        if (attempt > 0) await delay(150 * attempt);

        const targetUri = await findNextNumberedTarget(dirUri, baseName, ext, start);
        log(`attempt ${attempt + 1}: rename -> ${targetUri.fsPath}`);
        try {
          await vscode.workspace.fs.rename(uri, targetUri, { overwrite: false });
          log('rename: success');
          return;
        } catch (e) {
          log(`rename: failed (${e instanceof Error ? e.message : String(e)})`);
          // Retry: paste/copy may still be finalizing, or target name may race.
        }
      }
      log('rename: giving up after retries');
    } finally {
      // Ensure the set doesn't grow without bound.
      setTimeout(() => RECENTLY_HANDLED.delete(sourcePath), RECENTLY_HANDLED_TTL_MS);
    }
  });

  context.subscriptions.push(output, watcher);
}

export function deactivate() {}
