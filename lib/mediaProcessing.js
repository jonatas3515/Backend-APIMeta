// ============================================================================
// PROCESSAMENTO DE MÍDIA - Transcrição e Resumo via Gemini API
// ============================================================================

const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// Transcrever áudio usando Whisper (OpenAI) ou Gemini (fallback)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';

export async function transcribeAudio(audioUrl, mimeType = 'audio/ogg') {
  const audioBuffer = await fetchFileBuffer(audioUrl);
  if (!audioBuffer) return null;

  // Tenta Whisper primeiro se tiver chave (melhor para áudio WhatsApp)
  if (OPENAI_API_KEY) {
    const whisperText = await transcribeWithWhisper(audioBuffer);
    if (whisperText) return whisperText;
  }

  // Fallback para Gemini
  if (GEMINI_API_KEY) {
    return await transcribeWithGemini(audioBuffer, mimeType);
  }

  console.log('[MEDIA] Nenhuma chave de transcrição configurada');
  return null;
}

async function transcribeWithWhisper(audioBuffer) {
  try {
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
    formData.append('file', blob, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');
    formData.append('response_format', 'text');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(WHISPER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper error: ${response.status} - ${errorText}`);
    }

    const text = await response.text();
    console.log('[MEDIA] Áudio transcrito via Whisper:', text?.substring(0, 100));
    return text || null;
  } catch (error) {
    console.error('[MEDIA] Erro ao transcrever com Whisper:', error.message);
    return null;
  }
}

async function transcribeWithGemini(audioBuffer, mimeType = 'audio/ogg') {
  if (!GEMINI_API_KEY) return null;

  try {
    const base64Audio = audioBuffer.toString('base64');
    const finalMimeType = mimeType || 'audio/ogg';

    console.log(`[MEDIA] Iniciando transcrição Gemini, tamanho: ${audioBuffer.length} bytes, mime: ${finalMimeType}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'Transcreva o conteúdo deste áudio para texto em português. Retorne APENAS a transcrição, sem comentários.'
              },
              {
                inlineData: {
                  mimeType: finalMimeType,
                  data: base64Audio
                }
              }
            ]
          }
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('[MEDIA] Áudio transcrito via Gemini:', text?.substring(0, 100));
    return text || null;
  } catch (error) {
    console.error('[MEDIA] Erro ao transcrever com Gemini:', error.message);
    return null;
  }
}

// Resumir mídia (imagem, PDF, etc.) usando Gemini
export async function summarizeMedia(mediaUrl, mimeType) {
  if (!GEMINI_API_KEY) {
    console.log('[MEDIA] GOOGLE_AI_API_KEY não configurado, pulando resumo');
    return null;
  }

  try {
    const fileBuffer = await fetchFileBuffer(mediaUrl);
    if (!fileBuffer) return null;

    const base64 = fileBuffer.toString('base64');
    const finalMimeType = mimeType || 'application/pdf';

    const prompt = `Analise este documento/mídia e forneça um resumo jurídico objetivo. Liste os pontos mais relevantes, cláusulas importantes, prazos, valores e qualquer informação que possa ser útil para um advogado. Inclua no final um disclaimer: "Resumo gerado automaticamente. Recomenda-se revisão humana."`;

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt
              },
              {
                inlineData: {
                  mimeType: finalMimeType,
                  data: base64
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('[MEDIA] Mídia resumida:', text?.substring(0, 100));
    return text || null;
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
