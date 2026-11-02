import { withAuth, supabaseAdmin, getTenantOfficeId } from '@/lib/auth';
import logger from '@/lib/logger';

async function handler(req, res) {
  const userId = req.user?.id;

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const officeId = (req.user?.is_master && req.query?.office_id) || (typeof getTenantOfficeId === 'function' ? getTenantOfficeId(req) : null) || req.query?.office_id || req.user?.office_id || '00000000-0000-0000-0000-000000000001';

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabaseAdmin
        .from('offices')
        .select('id, name, cnpj, email, phone, logo_url, plan, status, trial_ends_at, created_at, birthday_message, birthday_message_weekly, notify_hour, notify_timezone')
        .eq('id', officeId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({ error: 'Escritório não encontrado' });
      }

      logger('info', 'OFFICE_CURRENT_SUCCESS', { userId, officeId, httpStatus: 200 });
      return res.status(200).json(data);
    } catch (error) {
      logger('error', 'OFFICE_CURRENT_ERROR', { userId, officeId, httpStatus: 500 });
      return res.status(500).json({ error: 'Erro ao buscar escritório' });
    }
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    // Apenas admin do escritório ou master pode alterar dados cadastrais
    if (req.user?.role !== 'admin' && !req.user?.is_master) {
      return res.status(403).json({ error: 'Apenas administradores podem alterar as configurações do escritório' });
    }

    const {
      name,
      cnpj,
      email,
      phone,
      logo_url,
      birthday_message,
      birthday_message_weekly,
      notify_hour,
      notify_timezone
    } = req.body || {};

    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = String(name).trim();
    if (cnpj !== undefined) updates.cnpj = cnpj ? String(cnpj).trim() : null;
    if (email !== undefined) updates.email = email ? String(email).trim().toLowerCase() : null;
    if (phone !== undefined) updates.phone = phone ? String(phone).trim() : null;
    if (logo_url !== undefined) updates.logo_url = logo_url ? String(logo_url).trim() : null;
    if (birthday_message !== undefined) updates.birthday_message = birthday_message;
    if (birthday_message_weekly !== undefined) updates.birthday_message_weekly = birthday_message_weekly;
    if (notify_hour !== undefined) updates.notify_hour = Number(notify_hour);
    if (notify_timezone !== undefined) updates.notify_timezone = notify_timezone;

    try {
      const { data, error } = await supabaseAdmin
        .from('offices')
        .update(updates)
        .eq('id', officeId)
        .select('id, name, cnpj, email, phone, logo_url, plan, status, trial_ends_at, created_at, birthday_message, birthday_message_weekly, notify_hour, notify_timezone')
        .single();

      if (error) throw error;

      logger('info', 'OFFICE_UPDATE_SUCCESS', { userId, officeId, httpStatus: 200 });
      return res.status(200).json({ success: true, office: data });
    } catch (error) {
      logger('error', 'OFFICE_UPDATE_ERROR', { userId, officeId, httpStatus: 500, error: error.message });
      return res.status(500).json({ error: 'Erro ao atualizar dados do escritório' });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
}

export default withAuth(handler, { minRole: 'estagiario' });
