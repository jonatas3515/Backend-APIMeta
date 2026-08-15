import { supabase } from '../../../lib/supabaseClient';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Token iCal obrigatório' });
    }

    // Busca usuário pelo token iCal
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('ical_token', token)
      .eq('ical_token_disabled', false)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'Token inválido ou desabilitado' });
    }

    // Registra acesso no log de auditoria
    await logICalAccess(user.id, token, req);

    // Busca eventos do usuário (agenda consolidada)
    const { data: events, error: eventsError } = await supabase
      .from('agenda_consolidada')
      .select('*')
      .eq('user_id', user.id)
      .gte('event_date', new Date().toISOString().split('T')[0])
      .order('event_date', { ascending: true });

    if (eventsError) throw eventsError;

    // Gera iCalendar
    const ical = generateICalendar(user, events || []);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="agenda_${user.id}.ics"`);
    res.status(200).send(ical);
  } catch (error) {
    console.error('[ICAL] Erro:', error);
    return res.status(500).json({ error: 'Erro ao gerar iCalendar' });
  }
}

function generateICalendar(user, events) {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  let ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Neves & Costa//Agenda Jurídica//PT
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Agenda Jurídica - ${user.name}
X-WR-TIMEZONE:America/Sao_Paulo
TIMEZONE:America/Sao_Paulo
`;

  events.forEach((event, index) => {
    const eventDate = event.event_date || event.deadline_date || event.scheduled_for;
    const eventTime = event.event_time || '09:00:00';
    const [year, month, day] = eventDate.split('-');
    const [hours, minutes, seconds] = eventTime.split(':');

    const dtstart = `${year}${month}${day}T${hours}${minutes}${seconds}`;
    const dtend = `${year}${month}${day}T${String(parseInt(hours) + 1).padStart(2, '0')}${minutes}${seconds}`;

    const summary = event.description || event.event_type || 'Evento';
    const description = event.notes || event.case_summary || '';
    const uid = `${event.id || index}@neves-costa.com`;

    ical += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${timestamp}
DTSTART:${dtstart}
DTEND:${dtend}
SUMMARY:${escapeICalText(summary)}
DESCRIPTION:${escapeICalText(description)}
LOCATION:${escapeICalText(event.location || 'Não especificado')}
PRIORITY:${getPriority(event.priority)}
STATUS:CONFIRMED
END:VEVENT
`;
  });

  ical += `END:VCALENDAR`;

  return ical;
}

function escapeICalText(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n');
}

function getPriority(priority) {
  const priorityMap = {
    'alta': '1',
    'media': '5',
    'baixa': '9'
  };
  return priorityMap[priority] || '5';
}

async function logICalAccess(userId, token, req) {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    await supabase
      .from('ical_access_logs')
      .insert({
        user_id: userId,
        token_used: hashToken(token),
        ip_address: ip,
        user_agent: userAgent
      });
  } catch (error) {
    console.warn('[ICAL-LOG] Erro ao registrar acesso:', error);
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
