import { spawn } from 'child_process';
import ffmpeg from 'ffmpeg-static';

/**
 * Converte um buffer de áudio para Ogg/Opus (mais compatível com Android/iPhone).
 * Retorna null se o ffmpeg não estiver disponível.
 */
export async function convertAudioToOgg(inputBuffer, originalMime) {
  if (!ffmpeg) {
    console.warn('[AUDIO] ffmpeg não disponível, pulando conversão');
    return null;
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', 'pipe:0',
      '-c:a', 'libopus',
      '-b:a', '24k',
      '-application', 'voip',
      '-f', 'ogg',
      'pipe:1'
    ];

    const child = spawn(ffmpeg, args);
    const output = [];
    const errors = [];

    child.stdout.on('data', (chunk) => output.push(chunk));
    child.stderr.on('data', (chunk) => errors.push(chunk));

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code !== 0 || output.length === 0) {
        const msg = Buffer.concat(errors).toString('utf-8') || `ffmpeg exit code ${code}`;
        return reject(new Error(`[AUDIO] Falha na conversão: ${msg}`));
      }
      resolve({
        buffer: Buffer.concat(output),
        mime: 'audio/ogg'
      });
    });

    child.stdin.write(inputBuffer);
    child.stdin.end();
  });
}
