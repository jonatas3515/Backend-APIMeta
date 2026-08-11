import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Transcrever áudio usando Gemini (modelo multimodal)
export async function transcribeAudio(audioUrl) {
  if (!GEMINI_API_KEY) {
    console.log('[MEDIA] GEMINI_API_KEY não configurado, pulando transcrição');
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Baixar arquivo de áudio
    const audioBuffer = await fetchFileBuffer(audioUrl);
    if (!audioBuffer) return null;

    const base64Audio = audioBuffer.toString('base64');
    const mimeType = 'audio/ogg';

    const result = await model.generateContent([
      'Transcreva o conteúdo deste áudio para texto em português. Retorne APENAS a transcrição, sem comentários.',
      {
        inlineData: {
          mimeType,
          data: base64Audio
        }
      }
    ]);

    const text = result.response.text();
    console.log('[MEDIA] Áudio transcrito:', text.substring(0, 100));
    return text;
  } catch (error) {
    console.error('[MEDIA] Erro ao transcrever áudio:', error.message);
    return null;
  }
}

// Resumir mídia (imagem, PDF, etc.) usando Gemini
export async function summarizeMedia(mediaUrl, mimeType) {
  if (!GEMINI_API_KEY) {
    console.log('[MEDIA] GEMINI_API_KEY não configurado, pulando resumo');
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const fileBuffer = await fetchFileBuffer(mediaUrl);
    if (!fileBuffer) return null;

    const base64 = fileBuffer.toString('base64');

    const prompt = `Analise este documento/mídia e forneça um resumo jurídico objetivo. Liste os pontos mais relevantes, cláusulas importantes, prazos, valores e qualquer informação que possa ser útil para um advogado. Inclua no final um disclaimer: "Resumo gerado automaticamente. Recomenda-se revisão humana."`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: mimeType || 'application/pdf',
          data: base64
        }
      }
    ]);

    const text = result.response.text();
    console.log('[MEDIA] Mídia resumida:', text.substring(0, 100));
    return text;
  } catch (error) {
    console.error('[MEDIA] Erro ao resumir mídia:', error.message);
    return null;
  }
}

async function fetchFileBuffer(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('[MEDIA] Erro ao baixar arquivo:', error.message);
    return null;
  }
}
