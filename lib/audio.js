import { spawn } from 'child_process';
import ffmpeg from 'ffmpeg-static';

/**
 * Converte um buffer de áudio para AMR-NB (formato nativo do WhatsApp).
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
      '-ar', '8000',
      '-ac', '1',
      '-ab', '12.2k',
      '-f', 'amr',
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
        mime: 'audio/amr'
      });
    });

    child.stdin.write(inputBuffer);
    child.stdin.end();
  });
}
