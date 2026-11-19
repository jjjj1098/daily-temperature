import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const fileName = '매일의-온도-잠금화면.png';
const graphemes = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('ko', { granularity: 'grapheme' })
  : null;

function glyphs(text) {
  return graphemes ? Array.from(graphemes.segment(text), item => item.segment) : Array.from(text);
}

// The browser has already broken the Korean event titles into lines. Read those
// line breaks so a long title and a family emoji survive the image export.
function paintText(ctx, node, style, origin) {
  const text = node.textContent;
  if (!text.trim()) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  ctx.fillStyle = style.color;
  ctx.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;

  function line(value, bounds) {
    ctx.fillText(value, bounds.left - origin.left, bounds.top - origin.top + bounds.height / 2);
  }
  if (range.getClientRects().length <= 1) {
    line(text, range.getBoundingClientRect());
    return;
  }
  let start = 0, lineText = '', firstRect;
  for (const glyph of glyphs(text)) {
    range.setStart(node, start);
    start += glyph.length;
    range.setEnd(node, start);
    const rect = range.getBoundingClientRect();
    if (firstRect && Math.abs(rect.top - firstRect.top) > 1) {
      line(lineText, firstRect);
      lineText = '';
    }
    if (!lineText) firstRect = rect;
    lineText += glyph;
  }
  if (lineText) line(lineText, firstRect);
}

function paintElement(ctx, element, origin) {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = rect.left - origin.left, y = rect.top - origin.top;
  const w = rect.width, h = rect.height;
  ctx.save();
  const radius = Math.min(parseFloat(style.borderTopLeftRadius) || 0, w / 2, h / 2);
  if (radius > 0) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    ctx.clip();
  }
  ctx.fillStyle = style.backgroundColor;
  ctx.fillRect(x, y, w, h);
  const borders = [
    [style.borderLeftColor, x, y, parseFloat(style.borderLeftWidth), h],
    [style.borderTopColor, x, y, w, parseFloat(style.borderTopWidth)],
    [style.borderRightColor, x + w - parseFloat(style.borderRightWidth), y, parseFloat(style.borderRightWidth), h],
    [style.borderBottomColor, x, y + h - parseFloat(style.borderBottomWidth), w, parseFloat(style.borderBottomWidth)],
  ];
  for (const [color, left, top, width, height] of borders) {
    if (!width || !height) continue;
    ctx.fillStyle = color;
    ctx.fillRect(left, top, width, height);
  }
  for (const child of element.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) paintElement(ctx, child, origin);
    if (child.nodeType === Node.TEXT_NODE) paintText(ctx, child, style, origin);
  }
  ctx.restore();
}

async function drawBackground(ctx, root, width, height) {
  const sky = ctx.createLinearGradient(0, 0, width / 2, height);
  sky.addColorStop(0, '#374963');
  sky.addColorStop(1, '#587772');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const landscape = root.querySelector('svg.jland');
  if (!landscape) return;
  const svg = landscape.cloneNode(true);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const image = new Image();
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    ctx.drawImage(image, 0, 0, width, height);
  } catch {
    // The gradient is also usable when the WebView disables SVG images.
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderWallpaper(root) {
  const modules = Array.from(root.querySelectorAll('#jwidget .lkmodule'));
  if (!modules.length) throw new Error('이미지에 넣을 달력이나 시간표를 먼저 선택해 주세요.');
  await document.fonts?.ready;

  const canvas = document.createElement('canvas');
  canvas.width = 1440;
  const { width, height } = window.screen;
  const deviceRatio = Math.max(width, height) / Math.max(1, Math.min(width, height));
  const ratio = matchMedia('(pointer: coarse)').matches ? Math.min(2.6, Math.max(1.3, deviceRatio)) : 2.16;
  canvas.height = Math.round(canvas.width * ratio);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('이미지를 만들 수 없어요. 다시 시도해 주세요.');
  await drawBackground(ctx, root, canvas.width, canvas.height);

  // Measure at reading size, independent of the preview's fit-to-screen transform.
  const layout = document.createElement('div');
  layout.setAttribute('aria-hidden', 'true');
  layout.style.cssText = 'position:absolute;left:-10000px;top:0;width:362px;display:grid;gap:7px;pointer-events:none;';
  layout.append(...modules.map(module => module.cloneNode(true)));
  root.append(layout);
  try {
    const bounds = layout.getBoundingClientRect();
    const top = Math.round(canvas.height * 0.24);
    const availableHeight = canvas.height * 0.94 - top;
    const scale = Math.min(canvas.width * 0.94 / bounds.width, availableHeight / bounds.height);
    ctx.translate((canvas.width - scale * bounds.width) / 2, top);
    ctx.scale(scale, scale);
    for (const card of layout.children) paintElement(ctx, card, bounds);
  } finally {
    layout.remove();
  }
  return canvas;
}

export async function exportWallpaper(root) {
  const canvas = await renderWallpaper(root);
  if (Capacitor.isNativePlatform()) {
    const data = canvas.toDataURL('image/png').split(',')[1];
    const { uri } = await Filesystem.writeFile({ directory: Directory.Cache, path: fileName, data });
    try {
      await Share.share({ title: '매일의 온도 잠금화면', files: [uri], dialogTitle: '잠금화면 이미지 저장 또는 공유' });
    } catch (error) {
      if (/cancel|취소/i.test(error?.message || '')) return '이미지 공유를 취소했어요.';
      throw error;
    }
    return '사진이나 파일에 저장한 이미지를 잠금화면 배경으로 선택해 주세요.';
  }
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('이미지를 만들 수 없어요. 다시 시도해 주세요.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return '잠금화면 PNG를 내려받았어요. 휴대폰에서 배경화면으로 선택해 주세요.';
}
