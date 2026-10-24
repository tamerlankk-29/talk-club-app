#!/usr/bin/env node
/**
 * Generates the PWA / favicon / notification icons from the Talk Club mark.
 * Run with: npm run icons -w apps/web
 */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const PURPLE = '#6d28d9';
const LIME = '#c6f432';

const bubble = (fill = '#ffffff', dots = true) => `
  <path d="M140 150h232a44 44 0 0 1 44 44v118a44 44 0 0 1-44 44H260l-78 60v-60h-42a44 44 0 0 1-44-44V194a44 44 0 0 1 44-44z" fill="${fill}"/>
  ${dots ? `<circle cx="194" cy="253" r="24" fill="${PURPLE}"/><circle cx="256" cy="253" r="24" fill="${PURPLE}"/><circle cx="318" cy="253" r="24" fill="${LIME}"/>` : ''}`;

// Rounded icon (any purpose)
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="128" fill="${PURPLE}"/>${bubble()}</svg>`;
// Square, full-bleed (iOS rounds corners itself)
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${PURPLE}"/>${bubble()}</svg>`;
// Maskable: content inside the 80% safe zone
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${PURPLE}"/><g transform="translate(76.8 76.8) scale(0.7)">${bubble()}</g></svg>`;
// Android notification badge: white silhouette on transparent
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bubble('#ffffff', false)}</svg>`;

const jobs = [
  [rounded, 'icon-192.png', 192],
  [rounded, 'icon-512.png', 512],
  [rounded, 'favicon-32.png', 32],
  [square, 'apple-touch-icon.png', 180],
  [maskable, 'maskable-512.png', 512],
  [badge, 'badge-72.png', 72],
];

await mkdir(out, { recursive: true });
for (const [svg, name, size] of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(resolve(out, name));
  console.log(`✓ ${name} (${size}×${size})`);
}
