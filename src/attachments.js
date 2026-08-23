import { readFileSync } from 'node:fs';
import { resolveInWorkspace } from './workspace.js';

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function parseAttachments(input, { visionSupported = true } = {}) {
  const errors = [];
  const images = [];
  const clean = String(input ?? '').replace(/@(\S+)/g, (match, relPath, offset, full) => {
    void offset;
    void full;
    const ext = relPath.slice(relPath.lastIndexOf('.')).toLowerCase();
    const mime = MIME[ext];
    if (!mime) return match;
    let abs;
    try {
      abs = resolveInWorkspace(relPath);
    } catch (err) {
      errors.push(`@${relPath}: ${err.message}`);
      return '';
    }
    if (!visionSupported) {
      errors.push(`@${relPath}: model does not support vision — pick a vision model (/model)`);
      return '';
    }
    try {
      const buf = readFileSync(abs);
      if (buf.length > MAX_IMAGE_BYTES) {
        errors.push(`@${relPath}: too large (${(buf.length / 1048576).toFixed(1)}MB > 5MB)`);
        return '';
      }
      images.push({ path: abs, mime, b64: buf.toString('base64') });
    } catch (err) {
      errors.push(`@${relPath}: ${err.message}`);
      return '';
    }
    return '';
  });

  return { clean: clean.replace(/\s{2,}/g, ' ').trim(), images, errors };
}

export function buildVisionContent(text, images) {
  if (!images?.length) return text;
  return [
    { type: 'text', text },
    ...images.map((img) => ({
      type: 'image_url',
      image_url: { url: `data:${img.mime};base64,${img.b64}` },
    })),
  ];
}
