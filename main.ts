// EMBERLINE entrypoint: hands the game in. Copies game/ and screenshots/
// from this repository into the output directory and writes dossier.json
// with the kit's buildDossier library. Standard library only, no network,
// no dates, no randomness: two runs write byte-identical output.

import { mkdir, rm, readdir, copyFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

async function copyPlainFiles(srcDir, destDir) {
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error('symlink found in entry files: ' + src);
    }
    if (entry.isDirectory()) {
      await mkdir(dest, { recursive: true });
      await copyPlainFiles(src, dest);
    } else if (entry.isFile()) {
      await copyFile(src, dest);
    } else {
      throw new Error('unsupported entry (not a plain file or directory): ' + src);
    }
  }
}

async function main() {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
  const gameDir = path.join(root, 'game');
  const shotsDir = path.join(root, 'screenshots');
  if (!existsSync(gameDir)) throw new Error('game/ directory missing: ' + gameDir);
  if (!existsSync(shotsDir)) throw new Error('screenshots/ directory missing: ' + shotsDir);
  await mkdir(outDir, { recursive: true });
  await mkdir(path.join(outDir, 'game'), { recursive: true });
  await mkdir(path.join(outDir, 'screenshots'), { recursive: true });
  await copyPlainFiles(gameDir, path.join(outDir, 'game'));
  await copyPlainFiles(shotsDir, path.join(outDir, 'screenshots'));
  const dossier = await buildDossier(outDir, CAPS);
  const bytes = typeof dossier === 'string'
    ? Buffer.from(dossier, 'utf8')
    : Buffer.from(dossier);
  await writeFile(path.join(outDir, 'dossier.json'), bytes);
}

main().catch((err) => {
  console.error('entry failed: ' + (err && err.message ? err.message : String(err)));
  process.exit(1);
});
