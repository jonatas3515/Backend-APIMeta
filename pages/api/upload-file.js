import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    console.error('[UPLOAD] Supabase não configurado');
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    const { fileBase64, fileName, fileType, conversationId } = req.body;

    if (!fileBase64 || !fileName || !conversationId) {
      console.error('[UPLOAD] Dados faltando:', { fileBase64: !!fileBase64, fileName, conversationId });
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    // Converter base64 para buffer
    const base64Data = fileBase64.split(',')[1] || fileBase64;
    const fileBuffer = Buffer.from(base64Data, 'base64');
    
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${conversationId}/${timestamp}-${sanitizedFileName}`;

    console.log('[UPLOAD] Fazendo upload:', filePath, 'Tamanho:', fileBuffer.length);

    // Upload para Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('chat-files')
      .upload(filePath, fileBuffer, {
        contentType: fileType || 'application/octet-stream',
        upsert: false
      });

    if (uploadError) {
      console.error('[UPLOAD] Erro no upload:', uploadError);
      throw uploadError;
    }

    // Obter URL pública
    const { data: urlData } = supabase.storage
      .from('chat-files')
      .getPublicUrl(filePath);

    console.log('[UPLOAD] Arquivo enviado com sucesso:', urlData.publicUrl);

    return res.status(200).json({
      success: true,
      url: urlData.publicUrl,
      fileName: sanitizedFileName,
      fileType: fileType
    });
  } catch (error) {
    console.error('[UPLOAD] Erro geral:', error);
    return res.status(500).json({ error: error.message });
  }
}
