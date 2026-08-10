import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    const form = formidable({ multiples: false });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('[UPLOAD] Erro ao fazer parse:', err);
        return res.status(500).json({ error: 'Erro ao processar arquivo' });
      }

      const file = files.file;
      if (!file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const conversationId = fields.conversationId;
      if (!conversationId) {
        return res.status(400).json({ error: 'conversationId não fornecido' });
      }

      try {
        // Ler arquivo
        const fileBuffer = fs.readFileSync(file.filepath);
        const fileName = `${Date.now()}-${file.originalFilename}`;
        const filePath = `${conversationId}/${fileName}`;

        // Upload para Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('chat-files')
          .upload(filePath, fileBuffer, {
            contentType: file.mimetype,
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

        console.log('[UPLOAD] Arquivo enviado:', urlData.publicUrl);

        return res.status(200).json({
          success: true,
          url: urlData.publicUrl,
          fileName: file.originalFilename,
          fileType: file.mimetype
        });
      } catch (uploadError) {
        console.error('[UPLOAD] Erro:', uploadError);
        return res.status(500).json({ error: uploadError.message });
      }
    });
  } catch (error) {
    console.error('[UPLOAD] Erro geral:', error);
    return res.status(500).json({ error: error.message });
  }
}
