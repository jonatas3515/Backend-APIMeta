// ============================================================================
// PROCESSAMENTO DE MÍDIA - Transcrição e Resumo via Gemini API
// ============================================================================

const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// Transcrever áudio usando Gemini (modelo multimodal)
export async function transcribeAudio(audioUrl) {
  if (!GEMINI_API_KEY) {
    console.log('[MEDIA] GOOGLE_AI_API_KEY não configurado, pulando transcrição');
    return null;
  }

  try {
    const audioBuffer = await fetchFileBuffer(audioUrl);
    if (!audioBuffer) return null;

    const base64Audio = audioBuffer.toString('base64');
    const mimeType = 'audio/ogg';

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
                  mimeType,
                  data: base64Audio
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
    console.log('[MEDIA] Áudio transcrito:', text?.substring(0, 100));
    return text || null;
  } catch (error) {
    console.error('[MEDIA] Erro ao transcrever áudio:', error.message);
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
