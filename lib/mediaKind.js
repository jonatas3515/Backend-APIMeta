// Classificação e normalização de mídia para o pipeline WhatsApp.
// Usado pelo ChatWindow (preview/rótulo) e por /api/send-message (upload à Meta).
// Não contém lógica de IA, LGPD, cálculo ou handoff.

const EXT_TO_KIND = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image',
  heic: 'image', heif: 'image', bmp: 'image',
  mp4: 'video', '3gp': 'video', '3gpp': 'video', m4v: 'video', mov: 'video',
  webm: 'video', mkv: 'video', avi: 'video',
  mp3: 'audio', m4a: 'audio', ogg: 'audio', opus: 'audio', amr: 'audio',
  aac: 'audio', wav: 'audio', weba: 'audio',
  pdf: 'document', doc: 'document', docx: 'document', txt: 'document',
  xls: 'document', xlsx: 'document', csv: 'document', zip: 'document'
};

const DOC_MIMES = new Set([
  'application/pdf', 'application/msword', 'text/plain',
  'application/zip', 'text/csv', 'application/octet-stream'
]);

function extOf(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const base = filename.split(/[?#]/)[0];
  const parts = base.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

export function getFileExtension(filename) {
  return extOf(filename);
}

// Resolve o tipo lógico da mídia: image | video | audio | document.
// Prioriza o MIME; quando ausente ou genérico, cai na extensão com segurança.
export function resolveMediaKind(mimeType, filename) {
  const mime = (mimeType || '').toLowerCase().trim();
  const ext = extOf(filename);

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (EXT_TO_KIND[ext]) return EXT_TO_KIND[ext];
  if (DOC_MIMES.has(mime) || mime.includes('wordprocessingml') || mime.includes('spreadsheetml')) {
    return 'document';
  }
  return 'document';
}

// MIME aceitos pela Meta Cloud API por tipo de mensagem.
const WHATSAPP_VIDEO_MIMES = new Set(['video/mp4', 'video/3gpp']);
const WHATSAPP_AUDIO_MIMES = new Set([
  'audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg'
]);

const VIDEO_EXT_MIME = { mp4: 'video/mp4', '3gp': 'video/3gpp', '3gpp': 'video/3gpp' };
const AUDIO_EXT_MIME = {
  mp3: 'audio/mpeg', mpeg: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4',
  ogg: 'audio/ogg', opus: 'audio/ogg', amr: 'audio/amr', aac: 'audio/aac'
};

// Retorna o MIME seguro para upload à Meta, ou null quando o formato não é
// suportado (ex.: vídeo .mov/.mkv/.webm — exige transcodificação que não fazemos).
export function normalizeWhatsAppMime(kind, mimeType, filename) {
  const mime = (mimeType || '').toLowerCase().trim();
  const ext = extOf(filename);

  if (kind === 'video') {
    if (WHATSAPP_VIDEO_MIMES.has(mime)) return mime;
    // Extensão só decide quando o MIME está ausente/genérico.
    // Um MIME declarado incompatível (quicktime, mkv, webm...) nunca é renomeado.
    if (!mime || mime === 'application/octet-stream') {
      if (VIDEO_EXT_MIME[ext]) return VIDEO_EXT_MIME[ext];
    }
    return null;
  }
  if (kind === 'audio') {
    if (WHATSAPP_AUDIO_MIMES.has(mime)) return mime;
    if (AUDIO_EXT_MIME[ext]) return AUDIO_EXT_MIME[ext];
    return null;
  }
  if (kind === 'image') return mime || `image/${ext === 'jpg' ? 'jpeg' : ext || 'jpeg'}`;
  return mime || 'application/octet-stream';
}

export function isWhatsAppAudioMime(mime) {
  return WHATSAPP_AUDIO_MIMES.has((mime || '').toLowerCase().trim());
}

// Limites de upload da Meta Cloud API (bytes).
export const MEDIA_MAX_BYTES = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024
};
