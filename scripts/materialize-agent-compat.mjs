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

const action = process.argv[2];

if (action !== 'prepack' && action !== 'postpack') {
  throw new Error('Expected `prepack` or `postpack`.');
}

const packageDir = process.cwd();
const packageJson = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
const agentsPath = join(packageDir, 'AGENTS.md');
const compatFilename = `${packageJson.name.slice(1).replaceAll('/', '-')}.md`;
const compatPath = join(packageDir, '.claude', 'rules', compatFilename);
const statePath = join(packageDir, '.pack-agent-compat-state.json');

function readState() {
  return JSON.parse(readFileSync(statePath, 'utf8'));
}

function captureCompatState() {
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

function restoreCompatState() {
  try {
    const state = readState();

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

    rmSync(statePath, { force: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }
}

if (action === 'prepack') {
  restoreCompatState();

  const state = captureCompatState();
  const agents = readFileSync(agentsPath, 'utf8');

  writeFileSync(statePath, JSON.stringify(state));
  mkdirSync(dirname(compatPath), { recursive: true });
  rmSync(compatPath, { force: true, recursive: true });
  writeFileSync(compatPath, agents);
}
} else {
  restoreCompatState();
}
