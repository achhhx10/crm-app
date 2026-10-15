#!/usr/bin/env node
/**
 * Guards the className merging contract.
 *
 * Components used to build their className with a template literal, so a
 * caller's className was appended rather than merged. Tailwind then resolved the
 * conflict by stylesheet order, not argument order: `w-auto` on a Select was
 * silently defeated by the base `w-full`, which is what clipped the phoning
 * filter bar, and `py-3` on CardContent was partly defeated by its own `pt-0`.
 *
 * These assertions fail if the contract regresses.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cn } from '../src/lib/utils.ts';

const UI = new URL('../src/components/', import.meta.url).pathname;
let failures = 0;
const fail = (msg) => { console.error(`  ✗ ${msg}`); failures += 1; };
const pass = (msg) => console.log(`  ✓ ${msg}`);

// 1. An override must defeat the base utility, which is the whole point.
const base = 'flex h-10 w-full rounded-md border px-3 py-2 text-sm';
const merged = cn(base, 'w-auto');
if (merged.includes('w-full')) fail(`cn('${base}', 'w-auto') garde w-full : ${merged}`);
else pass('un override w-auto élimine le w-full de base');

const pad = cn('p-6 pt-0', 'py-3');
if (pad.includes('pt-0')) fail(`cn('p-6 pt-0', 'py-3') garde pt-0 : ${pad}`);
else pass('un override py-3 élimine le pt-0 de base');

const button = cn('inline-flex rounded-md', 'bg-primary text-white', 'bg-destructive');
if (button.includes('bg-primary')) fail(`une variante antérieure survit : ${button}`);
else pass('la dernière variante de bouton l’emporte');

// 2. No component may concatenate a caller className again.
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

// 3. A custom class declared inside @layer components gains (0,2,0) under a
// dark variant, because Tailwind emits .dark\:x:is(.dark *). That outranks every
// plain utility at (0,1,0), so `position` there silently turned a sticky Card
// into a relatively positioned one and its top offset started applying for real.
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const layerBlock = css.match(/@layer\s+components\s*\{([\s\S]*?)\n\}/) || [null, ''];
const positionSetters = [...layerBlock[1].matchAll(/\n\s*(\.[\w-]+)\s*\{[^}]*\bposition\s*:/g)].map(m => m[1]);
if (positionSetters.length) {
  for (const sel of positionSetters) {
    fail(`${sel} déclare position dans @layer components : sous le variant dark cela atteint (0,2,0) et bat les utilitaires`);
  }
} else {
  pass('aucune classe custom ne déclare position dans @layer components');
}

const offenders = walk(UI)
  .filter((f) => /\`[^\`]*\$\{className\}/.test(readFileSync(f, 'utf8')))
  .map((f) => f.replace(UI, ''));

if (offenders.length) {
  for (const o of offenders) fail(`${o} concatène className au lieu de cn()`);
} else {
  pass('aucun composant ne concatène className');
}

console.log(failures === 0 ? '\nContrat de fusion respecté.' : `\n${failures} problème(s).`);
process.exit(failures === 0 ? 0 : 1);