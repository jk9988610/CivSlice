#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const script = join(dirname(fileURLToPath(import.meta.url)), 'migrate-civ-v3.mjs');
const result = spawnSync(process.execPath, [script, 'china'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
