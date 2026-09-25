import { resolveMediaKind, normalizeWhatsAppMime, getFileExtension, MEDIA_MAX_BYTES } from '../lib/mediaKind';

describe('resolveMediaKind', () => {
  test('classifica por MIME', () => {
    expect(resolveMediaKind('image/jpeg', 'a.jpg')).toBe('image');
    expect(resolveMediaKind('video/mp4', 'v.mp4')).toBe('video');
    expect(resolveMediaKind('audio/mpeg', 'a.mp3')).toBe('audio');
    expect(resolveMediaKind('application/pdf', 'd.pdf')).toBe('document');
  });

  test('MIME vazio cai na extensão com segurança', () => {
    expect(resolveMediaKind('', 'video.mp4')).toBe('video');
    expect(resolveMediaKind('', 'audio.m4a')).toBe('audio');
    expect(resolveMediaKind('', 'foto.heic')).toBe('image');
    expect(resolveMediaKind('', 'doc.pdf')).toBe('document');
    expect(resolveMediaKind(null, 'sem-ext')).toBe('document');
  });

  test('MIME genérico (octet-stream) usa extensão', () => {
    expect(resolveMediaKind('application/octet-stream', 'clip.mp4')).toBe('video');
  });

  test('mov/quicktime é vídeo, nunca imagem', () => {
    expect(resolveMediaKind('video/quicktime', 'gravacao.mov')).toBe('video');
    expect(resolveMediaKind('', 'gravacao.mov')).toBe('video');
  });
});

describe('normalizeWhatsAppMime — vídeo', () => {
  test('mp4 e 3gpp passam direto', () => {
    expect(normalizeWhatsAppMime('video', 'video/mp4', 'v.mp4')).toBe('video/mp4');
    expect(normalizeWhatsAppMime('video', 'video/3gpp', 'v.3gp')).toBe('video/3gpp');
  });

  test('MIME vazio usa extensão mp4/3gp', () => {
    expect(normalizeWhatsAppMime('video', '', 'v.mp4')).toBe('video/mp4');
    expect(normalizeWhatsAppMime('video', '', 'v.3gp')).toBe('video/3gpp');
  });

  test('mov, mkv, webm e avi são rejeitados (não renomeia para mp4)', () => {
    expect(normalizeWhatsAppMime('video', 'video/quicktime', 'v.mov')).toBeNull();
    expect(normalizeWhatsAppMime('video', 'video/x-matroska', 'v.mkv')).toBeNull();
    expect(normalizeWhatsAppMime('video', 'video/webm', 'v.webm')).toBeNull();
    expect(normalizeWhatsAppMime('video', '', 'v.avi')).toBeNull();
    // MIME declarado incompatível não é mascarado nem por extensão .mp4
    expect(normalizeWhatsAppMime('video', 'video/quicktime', 'v.mp4')).toBeNull();
    expect(normalizeWhatsAppMime('video', 'video/x-matroska', 'v.mp4')).toBeNull();
  });
});

describe('helpers', () => {
  test('getFileExtension ignora query string e case', () => {
    expect(getFileExtension('a.B/clip.MP4?x=1')).toBe('mp4');
    expect(getFileExtension('sem-ext')).toBe('');
  });

  test('limites de mídia definidos', () => {
    expect(MEDIA_MAX_BYTES.video).toBe(16 * 1024 * 1024);
    expect(MEDIA_MAX_BYTES.image).toBe(5 * 1024 * 1024);
  });
});
