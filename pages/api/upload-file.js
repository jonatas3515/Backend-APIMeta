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
    const { fileName, fileType, conversationId } = req.body;

    if (!fileName || !conversationId) {
      console.error('[UPLOAD] Dados faltando:', { fileName, conversationId });
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${conversationId}/${timestamp}-${sanitizedFileName}`;

    console.log('[UPLOAD] Gerando URL assinada:', filePath);

    // Gerar URL assinada para upload direto (sem passar pelo servidor)
    const { data, error } = await supabase.storage
      .from('chat-files')
      .createSignedUploadUrl(filePath);

    if (error) {
      console.error('[UPLOAD] Erro ao gerar URL:', error);
      throw error;
    }

    console.log('[UPLOAD] URL assinada gerada:', data?.token);

    return res.status(200).json({
      success: true,
      signedUrl: data.signedUrl,
      filePath,
      fileName: sanitizedFileName,
      fileType: fileType || 'application/octet-stream'
    });
  } catch (error) {
    console.error('[UPLOAD] Erro geral:', error);
    return res.status(500).json({ error: error.message });
  }
}
