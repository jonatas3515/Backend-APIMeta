import { supabase } from '../../../lib/supabaseClient';
import crypto from 'crypto';

function generateUUID() {
  return crypto.randomUUID();
}

export default async function handler(req, res) {
  try {
    const headers = req.headers;
    const token = headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    // Verifica autenticação
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    if (req.method === 'GET') {
      return handleGet(user.id, res);
    } else if (req.method === 'POST') {
      return handlePost(user.id, req, res);
    } else if (req.method === 'DELETE') {
      return handleDelete(user.id, res);
    } else {
      return res.status(405).json({ error: 'Método não permitido' });
    }
  } catch (error) {
    console.error('[CALENDAR-TOKEN] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

async function handleGet(userId, res) {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('ical_token, ical_token_disabled, ical_token_generated_at')
      .eq('id', userId)
      .single();

    if (error) throw error;

    if (!user || !user.ical_token) {
      return res.status(404).json({ error: 'Token iCal não encontrado' });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://chatnevesecosta.vercel.app';
    const icalUrl = `${baseUrl}/api/calendar/ical?token=${user.ical_token}`;

    return res.status(200).json({
      disabled: user.ical_token_disabled,
      generated_at: user.ical_token_generated_at,
      ical_url: icalUrl,
      message: 'Token carregado com sucesso'
    });
  } catch (error) {
    console.error('[CALENDAR-TOKEN-GET] Erro:', error);
    return res.status(500).json({ error: 'Erro ao buscar token' });
  }
}

async function handlePost(userId, req, res) {
  try {
    const { action } = req.body;

    if (action === 'regenerate') {
      // Gera novo token
      const newToken = generateUUID();

      const { error } = await supabase
        .from('users')
        .update({
          ical_token: newToken,
          ical_token_generated_at: new Date().toISOString(),
          ical_token_disabled: false
        })
        .eq('id', userId);

      if (error) throw error;

      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://chatnevesecosta.vercel.app';
      const icalUrl = `${baseUrl}/api/calendar/ical?token=${newToken}`;

      return res.status(200).json({
        message: 'Token regenerado com sucesso',
        token: newToken,
        ical_url: icalUrl
      });
    }

    return res.status(400).json({ error: 'Ação não reconhecida' });
  } catch (error) {
    console.error('[CALENDAR-TOKEN-POST] Erro:', error);
    return res.status(500).json({ error: 'Erro ao regenerar token' });
  }
}

async function handleDelete(userId, res) {
  try {
    // Desabilita token sem deletar
    const { error } = await supabase
      .from('users')
      .update({
        ical_token_disabled: true
      })
      .eq('id', userId);

    if (error) throw error;

    return res.status(200).json({
      message: 'Token iCal desabilitado com sucesso'
    });
  } catch (error) {
    console.error('[CALENDAR-TOKEN-DELETE] Erro:', error);
    return res.status(500).json({ error: 'Erro ao desabilitar token' });
  }
}
