import type { S } from '@/lib/api/types';
import { messagesFor } from '@/lib/i18n';
import { profileMessages } from '@/lib/i18n/messages/profile';
import { fmt } from '@/lib/format';

const W = 1080;
const H = 1350;
const BRAND = '#2e1065';
const BRAND_MID = '#6d28d9';
const ZEST = '#c6f432';

/** Draws the member's recap as a 1080×1350 PNG (Instagram portrait) in the current language. */
export async function renderRecap(stats: S<'ClientStatsDto'>, firstName: string): Promise<Blob> {
  const t = messagesFor(profileMessages);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported');
  const display = resolvedFont('var(--font-display)');
  const body = resolvedFont('var(--font-sans)');
  await document.fonts?.ready;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, BRAND);
  bg.addColorStop(1, BRAND_MID);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(198, 244, 50, 0.12)';
  ctx.beginPath();
  ctx.arc(W - 80, 140, 320, 0, Math.PI * 2);
  ctx.fill();

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ZEST;
  ctx.font = `700 44px ${display}`;
  ctx.fillText('TALK CLUB', 80, 130);
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 64px ${display}`;
  wrap(ctx, t.recapTitle(firstName), 80, 250, W - 160, 76);

  const hours = Math.round((stats.totalMinutesSpeaking / 60) * 10) / 10;
  const tiles: Array<{ value: string; label: string }> = [
    { value: fmt.number(stats.sessionsAttended), label: t.recapSessions(stats.sessionsAttended) },
    { value: fmt.number(hours), label: t.recapHours },
    { value: fmt.number(Math.max(stats.currentStreakWeeks, stats.bestStreakWeeks)), label: t.recapStreak(Math.max(stats.currentStreakWeeks, stats.bestStreakWeeks)) },
    { value: fmt.number(stats.teachersMet), label: t.recapTeachers(stats.teachersMet) },
  ];
  const tileW = (W - 160 - 40) / 2;
  const tileH = 260;
  tiles.forEach((tile, i) => {
    const x = 80 + (i % 2) * (tileW + 40);
    const y = 440 + Math.floor(i / 2) * (tileH + 40);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    roundRect(ctx, x, y, tileW, tileH, 36);
    ctx.fill();
    ctx.fillStyle = i === 0 ? ZEST : '#ffffff';
    ctx.font = `700 110px ${display}`;
    ctx.fillText(tile.value, x + 40, y + 140);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = `500 34px ${body}`;
    wrap(ctx, tile.label, x + 40, y + 200, tileW - 80, 40);
  });

  ctx.fillStyle = '#ffffff';
  ctx.font = `500 38px ${body}`;
  let y = 1080;
  if (stats.favoriteTeacher) {
    ctx.fillText(t.recapFavourite(stats.favoriteTeacher.name), 80, y);
    y += 56;
  }
  if (stats.firstVisitAt) ctx.fillText(t.recapSince(fmt.date(stats.firstVisitAt)), 80, y);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = `500 30px ${body}`;
  ctx.fillText(t.recapFooter, 80, H - 80);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/png'));
}

/** Opens the share sheet with the image where supported, otherwise downloads it. Returns true when downloaded. */
export async function shareOrDownload(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return false;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** The page's actual font stack (canvas can't read CSS variables itself). */
function resolvedFont(cssValue: string): string {
  const probe = document.createElement('span');
  probe.style.fontFamily = cssValue;
  document.body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily;
  probe.remove();
  return family || 'system-ui, sans-serif';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, x, y);
}
