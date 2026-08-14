import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

function escapeIcalText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function parseDate(date, time = null) {
  const [hours, minutes] = time ? time.split(':').map(Number) : [0, 0];
  const d = new Date(date + 'T00:00:00');
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function toIcalDateTime(d, allDay = false) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (allDay) return `${year}${month}${day}`;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${h}${m}${s}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d;
}

export async function getIcalEvents(startDate, endDate) {
  if (!supabaseAdmin) {
    throw new Error('Supabase não configurado');
  }

  const events = [];

  // Prazos de casos
  try {
    const { data: cases } = await supabaseAdmin
      .from('cases')
      .select('id, conversation_id, title, deadline_date, deadline_type, priority, legal_area, case_type, municipality, status')
      .gte('deadline_date', startDate)
      .lte('deadline_date', endDate)
      .order('deadline_date', { ascending: true });

    (cases || []).forEach(c => {
      const endDateAllDay = addDays(c.deadline_date, 1);
      events.push({
        id: `case-deadline-${c.id}`,
        start: `;VALUE=DATE:${toIcalDateTime(parseDate(c.deadline_date), true)}`,
        end: `;VALUE=DATE:${toIcalDateTime(endDateAllDay, true)}`,
        summary: `Prazo: ${c.deadline_type} - ${c.title || 'Caso #' + c.id}`,
        description: escapeIcalText(`Caso #${c.id}\\nTipo: ${c.case_type || '-'}\\nÁrea: ${c.legal_area || '-'}\\nMunicípio: ${c.municipality || '-'}\\nPrioridade: ${c.priority || '-'}\\nStatus: ${c.status || '-'}`),
        url: `https://backend-apimeta.vercel.app/?tab=cases&case_id=${c.id}`
      });
    });
  } catch (error) {
    console.error('[CALENDAR] Erro ao buscar cases:', error);
  }

  // Lembretes
  try {
    const { data: reminders } = await supabaseAdmin
      .from('chat_reminders')
      .select('id, case_id, conversation_id, description, scheduled_for, reminder_type, priority, caseInfo:cases(title, id, conversation_id)')
      .gte('scheduled_for', startDate)
      .lte('scheduled_for', endDate)
      .order('scheduled_for', { ascending: true });

    (reminders || []).forEach(r => {
      const endDateAllDay = addDays(r.scheduled_for, 1);
      events.push({
        id: `reminder-${r.id}`,
        start: `;VALUE=DATE:${toIcalDateTime(parseDate(r.scheduled_for), true)}`,
        end: `;VALUE=DATE:${toIcalDateTime(endDateAllDay, true)}`,
        summary: `Lembrete: ${r.reminder_type} - ${r.description || 'Sem título'}`,
        description: escapeIcalText(`${r.description || ''}\\nTipo: ${r.reminder_type || '-'}\\nPrioridade: ${r.priority || '-'}${r.case_id ? `\\nCaso: ${r.caseInfo?.title || '#' + r.case_id}` : ''}`),
        url: r.case_id ? `https://backend-apimeta.vercel.app/?tab=cases&case_id=${r.case_id}` : 'https://backend-apimeta.vercel.app/'
      });
    });
  } catch (error) {
    console.error('[CALENDAR] Erro ao buscar lembretes:', error);
  }

  // Eventos do caso
  try {
    const { data: caseEvents } = await supabaseAdmin
      .from('case_events')
      .select('id, case_id, event_date, event_time, event_type, description, priority, location, caseInfo:cases(title, id, conversation_id)')
      .gte('event_date', startDate)
      .lte('event_date', endDate)
      .order('event_date', { ascending: true });

    (caseEvents || []).forEach(e => {
      const hasTime = e.event_time && /^\d{1,2}:\d{2}$/.test(e.event_time);
      const startDateObj = hasTime ? parseDate(e.event_date, e.event_time) : parseDate(e.event_date);
      const endDateObj = hasTime
        ? new Date(startDateObj.getTime() + 60 * 60 * 1000)
        : addDays(e.event_date, 1);
      const start = hasTime
        ? `:${toIcalDateTime(startDateObj)}`
        : `;VALUE=DATE:${toIcalDateTime(startDateObj, true)}`;
      const end = hasTime
        ? `:${toIcalDateTime(endDateObj)}`
        : `;VALUE=DATE:${toIcalDateTime(endDateObj, true)}`;

      events.push({
        id: `case-event-${e.id}`,
        start,
        end,
        summary: `${e.event_type} - ${e.caseInfo?.title || 'Caso #' + e.case_id}`,
        description: escapeIcalText(`${e.description || ''}\\nTipo: ${e.event_type || '-'}\\nPrioridade: ${e.priority || '-'}\\nLocal: ${e.location || '-'}\\nCaso: ${e.caseInfo?.title || '#' + e.case_id}`),
        url: `https://backend-apimeta.vercel.app/?tab=cases&case_id=${e.case_id}`
      });
    });
  } catch (error) {
    console.error('[CALENDAR] Erro ao buscar eventos:', error);
  }

  return events;
}

export function generateIcal(events) {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Neves e Costa Advocacia//Agenda Juridica//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Agenda Jurídica - Neves & Costa',
    'X-WR-TIMEZONE:America/Bahia'
  ];

  events.forEach(event => {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.id}@nevesecosta.adv.br`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART${event.start}`);
    lines.push(`DTEND${event.end}`);
    lines.push(`SUMMARY:${event.summary}`);
    if (event.description) {
      // Quebra linhas longas (máx 75 caracteres conforme RFC 5545)
      const desc = `DESCRIPTION:${event.description}`;
      for (let i = 0; i < desc.length; i += 74) {
        const prefix = i === 0 ? '' : ' ';
        lines.push(`${prefix}${desc.slice(i, i + 74)}`);
      }
    }
    if (event.url) {
      lines.push(`URL:${event.url}`);
    }
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
