// Sky Courier: Harbor Run — a make.fun entry for "Make the best flight game".
//
// This program is the whole hand-in. The game itself lives in game/ as plain
// static files (game/index.html plus its ES modules under game/src/) that a
// desktop browser opens offline with no network request. Running this file
// with Node 22 copies game/ and screenshots/ into the output directory and
// then writes dossier.json there with the vendored make.fun library, which
// the scorer re-runs byte-for-byte on the same output.
//
// The output directory is MAKEFUN_OUTPUT_DIR when set, otherwise /output
// (the grader's mount). Nothing is ever written beside this script: the
// directory it lives in is read-only while grading runs.
//
// Local check:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy in a fixed order and let the dossier builder sort what it lists, so
// two runs over the same tree produce byte-identical output.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The caps below are the competition's own gate values: the dossier text
// budget shapes the bytes written, and the rest make this program refuse an
// entry the scorer would refuse (too many screenshots or game files, an
// oversized screenshot or game tree, or an over-long path under game/).
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
