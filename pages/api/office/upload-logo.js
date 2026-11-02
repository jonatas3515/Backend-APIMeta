import { withAuth, supabaseAdmin, getTenantOfficeId } from '@/lib/auth';
import logger from '@/lib/logger';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

/**
 * Endpoint dedicado para upload da logomarca do escritório.
 * Salva a imagem no bucket público 'site-media' em 'office-logos/'
 * e atualiza o campo logo_url do escritório na tabela 'offices'.
 */
async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  // Apenas admin do escritório ou master pode alterar a logo
  if (req.user?.role !== 'admin' && !req.user?.is_master) {
    return res.status(403).json({ error: 'Apenas administradores podem atualizar a logo do escritório' });
  }

  const officeId = (req.user?.is_master && req.body?.office_id) || getTenantOfficeId(req);
  if (!officeId) {
    return res.status(400).json({ error: 'Escritório não identificado' });
  }

  try {
    const { image, fileName, contentType } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    }

    let buffer;
    let mime = contentType || 'image/png';
    let ext = 'png';

    if (image.startsWith('data:')) {
      // Formato Data URI: data:image/png;base64,...
      const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        mime = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        return res.status(400).json({ error: 'Formato de imagem base64 inválido' });
      }
    } else {
      buffer = Buffer.from(image, 'base64');
    }

    if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
    else if (mime.includes('png')) ext = 'png';
    else if (mime.includes('webp')) ext = 'webp';
    else if (mime.includes('svg')) ext = 'svg';

    const timestamp = Date.now();
    const filePath = `office-logos/${officeId}-${timestamp}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('site-media')
      .upload(filePath, buffer, {
        contentType: mime,
        upsert: true
      });

    if (uploadError) {
      logger('error', 'OFFICE_LOGO_STORAGE_ERROR', { error: uploadError.message, officeId });
      return res.status(500).json({ error: 'Erro ao salvar imagem no storage' });
    }

    const { data: pubData } = supabaseAdmin.storage
      .from('site-media')
      .getPublicUrl(filePath);

    const publicUrl = pubData?.publicUrl;

    if (!publicUrl) {
      return res.status(500).json({ error: 'Erro ao gerar URL pública da logomarca' });
    }

    // Atualiza a tabela offices
    const { data: updatedOffice, error: updateError } = await supabaseAdmin
      .from('offices')
      .update({
        logo_url: publicUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', officeId)
      .select('id, name, logo_url')
      .single();

    if (updateError) {
      logger('error', 'OFFICE_LOGO_UPDATE_DB_ERROR', { error: updateError.message, officeId });
      return res.status(500).json({ error: 'Erro ao atualizar logomarca no cadastro do escritório' });
    }

    logger('info', 'OFFICE_LOGO_UPLOAD_SUCCESS', { officeId, publicUrl });
    return res.status(200).json({
      success: true,
      logo_url: publicUrl,
      office: updatedOffice
    });
  } catch (error) {
    logger('error', 'OFFICE_LOGO_UPLOAD_EXCEPTION', { error: error.message, officeId });
    return res.status(500).json({ error: error.message || 'Erro interno no upload da logo' });
  }
}

export default withAuth(handler, { minRole: 'admin' });
