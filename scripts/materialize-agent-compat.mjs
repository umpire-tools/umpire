import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

// ── Config ───────────────────────────────────────────────────────────────────
// Folders (relative to the package root) where the AGENTS.md compat file
// should be materialized during `npm pack`. Add more paths here to distribute
// rules to additional agent runtimes (e.g. '.codex/rules', '.cursor/rules').
const compatPaths = ['.claude/rules'];
// ─────────────────────────────────────────────────────────────────────────────

const action = process.argv[2];

if (action !== 'prepack' && action !== 'postpack') {
  throw new Error('Expected `prepack` or `postpack`.');
}

const packageDir = process.cwd();
const packageJson = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
const agentsPath = join(packageDir, 'AGENTS.md');
const compatFilename = `${packageJson.name.slice(1).replaceAll('/', '-')}.md`;
const statePath = join(packageDir, '.pack-agent-compat-state.json');

function resolvedCompatPaths() {
  return compatPaths.map(folder => join(packageDir, folder, compatFilename));
}

function captureCompatState(compatPath) {
  try {
    const stat = lstatSync(compatPath);

    if (stat.isSymbolicLink()) {
      return {
        existed: true,
        type: 'symlink',
        linkname: readlinkSync(compatPath)
      };
    }

    if (stat.isFile()) {
      return {
        existed: true,
        type: 'file',
        content: readFileSync(compatPath, 'utf8')
      };
    }

    throw new Error(`Unsupported compatibility file entry at ${compatPath}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { existed: false };
    }

    throw error;
  }
}

function restoreCompatState(compatPath, state) {
  rmSync(compatPath, { force: true, recursive: true });

  if (state.existed) {
    mkdirSync(dirname(compatPath), { recursive: true });

    if (state.type === 'symlink') {
      symlinkSync(state.linkname, compatPath);
    } else if (state.type === 'file') {
      writeFileSync(compatPath, state.content);
    } else {
      throw new Error(`Unsupported compatibility file state for ${compatPath}`);
    }
  }
}

function restoreAllFromStateFile() {
  try {
    const savedState = JSON.parse(readFileSync(statePath, 'utf8'));
    for (const [path, state] of Object.entries(savedState)) {
      restoreCompatState(path, state);
    }
    rmSync(statePath, { force: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

if (action === 'prepack') {
  // Clean up any stale state from an interrupted previous pack
  restoreAllFromStateFile();

  const agents = readFileSync(agentsPath, 'utf8');
  const savedState = {};

  for (const compatPath of resolvedCompatPaths()) {
    savedState[compatPath] = captureCompatState(compatPath);
    mkdirSync(dirname(compatPath), { recursive: true });
    rmSync(compatPath, { force: true, recursive: true });
    writeFileSync(compatPath, agents);
  }

  writeFileSync(statePath, JSON.stringify(savedState));
} else {
  restoreAllFromStateFile();
}
