import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { safeLog, safeError } from '@/lib/safeLogger';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const TARGET_PHONE = '5573999348552';
const TIMEZONE = 'America/Bahia';

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

/**
 * Retorna componentes da data/hora atual no fuso horário do Brasil
 */
function getBrazilDateTime() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(now);
  const map = {};
  parts.forEach(p => { map[p.type] = p.value; });
  
  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10);
  const day = parseInt(map.day, 10);
  const hour = parseInt(map.hour, 10);
  const minute = parseInt(map.minute, 10);
  
  const todayStr = `${map.year}-${map.month}-${map.day}`;
  
  // Calcula a data de amanhã no fuso do Brasil
  const tomorrowDate = new Date(year, month - 1, day + 1);
  const tomYear = tomorrowDate.getFullYear();
  const tomMonth = String(tomorrowDate.getMonth() + 1).padStart(2, '0');
  const tomDay = String(tomorrowDate.getDate()).padStart(2, '0');
  const tomorrowStr = `${tomYear}-${tomMonth}-${tomDay}`;
  
  return {
    todayStr,
    tomorrowStr,
    hour,
    minute,
    monthDay: `${map.month}-${map.day}`,
    formattedToday: `${map.day}/${map.month}/${map.year}`,
    formattedTomorrow: `${tomDay}/${tomMonth}/${tomYear}`
  };
}

/**
 * Tenta extrair horário (ex: 11:30 ou 08:40) das notas do caso
 */
function extractTimeFromNotes(notes) {
  if (!notes) return null;
  const match = notes.match(/(?:às|as|horário:?|horario:?)\s*(\d{1,2}[:h]\d{2})/i) ||
                notes.match(/\b(\d{1,2}:\d{2})\s*(?:h|hrs|horas)?\b/i);
  return match ? match[1].replace('h', ':') : null;
}

/**
 * Formata um compromisso para exibição na mensagem do WhatsApp
 */
function formatCaseItem(c, index) {
  const isAudiencia = /audi[eê]ncia|aij|concilia[cç][aã]o|instru[cç][aã]o/i.test(c.deadline_type || '') ||
                      /audi[eê]ncia|concilia[cç][aã]o/i.test(c.case_type || '');
  const tipoLabel = isAudiencia ? '🏛️ AUDIÊNCIA' : `📅 PRAZO (${c.deadline_type || 'Fatal'})`;
  const time = extractTimeFromNotes(c.notes);
  const horarioText = time ? ` às *${time}h*` : (isAudiencia ? ' (Horário pendente)' : ' (Prazo fatal)');
  
  const lines = [
    `${index + 1}. *${tipoLabel}*${horarioText}`,
    `   📁 *Caso:* ${c.title || 'Sem título'}`,
    `   🔢 *Processo:* ${c.process_number || 'Sem CNJ'}`
  ];
  
  const juizo = [c.court_division, c.judicial_district || c.municipality].filter(Boolean).join(' • ');
  if (juizo) lines.push(`   📍 *Juízo / Comarca:* ${juizo}`);
  if (c.procedural_step) lines.push(`   🎯 *Fase:* ${c.procedural_step}`);
  
  return lines.join('\n');
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const isCronAuthorized = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;
  
  // Permite GET e POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const { trigger, force, target_phone } = req.query || {};
  const recipient = target_phone || TARGET_PHONE;
  const bypassLock = force === 'true';

  try {
    const brazil = getBrazilDateTime();
    const results = {
      execution_time: new Date().toISOString(),
      brazil_time: `${brazil.todayStr} ${String(brazil.hour).padStart(2, '0')}:${String(brazil.minute).padStart(2, '0')}`,
      actions: []
    };

    // Determina quais rotinas executar:
    // 1. Se especificado ?trigger=eve|day|bday|all, força aquela rotina
    // 2. Senão, executa baseado no horário atual no Brasil:
    //    - 12h (meio-dia) -> Véspera (eve)
    //    - 7h da manhã   -> Dia (day)
    //    - 9h da manhã   -> Aniversários (bday)
    const shouldRunEve = trigger === 'eve' || trigger === 'all' || (!trigger && brazil.hour === 12);
    const shouldRunDay = trigger === 'day' || trigger === 'all' || (!trigger && brazil.hour === 7);
    const shouldRunBday = trigger === 'bday' || trigger === 'all' || (!trigger && brazil.hour === 9);

    // =========================================================================
    // 1. LEMBRETE DE VÉSPERA (D-1) — 12:00
    // =========================================================================
    if (shouldRunEve) {
      const lockKey = `cron_eve:${brazil.tomorrowStr}`;
      let canSend = true;

      if (!bypassLock) {
        const { data: alreadySent } = await supabase
          .from('chat_reminders')
          .select('id')
          .eq('client_phone', recipient)
          .eq('title', lockKey)
          .eq('status', 'sent')
          .limit(1);

        if (alreadySent && alreadySent.length > 0) {
          canSend = false;
          results.actions.push({ routine: 'eve', status: 'skipped_already_sent', date: brazil.tomorrowStr });
        }
      }

      if (canSend) {
        const { data: casesTomorrow, error: casesErr } = await supabase
          .from('cases')
          .select('*')
          .eq('deadline_date', brazil.tomorrowStr)
          .neq('status', 'encerrado')
          .order('created_at', { ascending: true });

        if (casesErr) throw casesErr;

        if (casesTomorrow && casesTomorrow.length > 0) {
          const itemsList = casesTomorrow.map((c, i) => formatCaseItem(c, i)).join('\n\n');
          const messageText = `⚖️ *LEMBRETE DE VÉSPERA — Compromissos de Amanhã (${brazil.formattedTomorrow})*

Dr. Jonatas, você possui *${casesTomorrow.length}* compromisso(s) previsto(s) para amanhã:

${itemsList}

_Mensagem automática gerada pelo Assistente Neves & Costa para preparação prévia._`;

          await sendWhatsAppMessage(recipient, messageText);

          // Registra na chat_reminders para idempotência
          await supabase.from('chat_reminders').insert([{
            client_phone: recipient,
            type: 'cron_eve',
            title: lockKey,
            message: messageText,
            scheduled_for: new Date().toISOString(),
            sent_at: new Date().toISOString(),
            status: 'sent',
            created_by: 'daily_cron'
          }]);

          results.actions.push({ routine: 'eve', status: 'sent', count: casesTomorrow.length, date: brazil.tomorrowStr });
        } else {
          results.actions.push({ routine: 'eve', status: 'no_events', date: brazil.tomorrowStr });
        }
      }
    }

    // =========================================================================
    // 2. LEMBRETE DO DIA (D) — 07:00
    // =========================================================================
    if (shouldRunDay) {
      const lockKey = `cron_day:${brazil.todayStr}`;
      let canSend = true;

      if (!bypassLock) {
        const { data: alreadySent } = await supabase
          .from('chat_reminders')
          .select('id')
          .eq('client_phone', recipient)
          .eq('title', lockKey)
          .eq('status', 'sent')
          .limit(1);

        if (alreadySent && alreadySent.length > 0) {
          canSend = false;
          results.actions.push({ routine: 'day', status: 'skipped_already_sent', date: brazil.todayStr });
        }
      }

      if (canSend) {
        const { data: casesToday, error: casesErr } = await supabase
          .from('cases')
          .select('*')
          .eq('deadline_date', brazil.todayStr)
          .neq('status', 'encerrado')
          .order('created_at', { ascending: true });

        if (casesErr) throw casesErr;

        if (casesToday && casesToday.length > 0) {
          const itemsList = casesToday.map((c, i) => formatCaseItem(c, i)).join('\n\n');
          const messageText = `⚖️ *BOM DIA, DR. JONATAS! — Agenda de Hoje (${brazil.formattedToday})*

Seus compromissos forenses previstos para hoje:

${itemsList}

Desejamos um excelente e produtivo dia de trabalho!
_Assistente Forense Neves & Costa_`;

          await sendWhatsAppMessage(recipient, messageText);

          // Registra na chat_reminders para idempotência
          await supabase.from('chat_reminders').insert([{
            client_phone: recipient,
            type: 'cron_day',
            title: lockKey,
            message: messageText,
            scheduled_for: new Date().toISOString(),
            sent_at: new Date().toISOString(),
            status: 'sent',
            created_by: 'daily_cron'
          }]);

          results.actions.push({ routine: 'day', status: 'sent', count: casesToday.length, date: brazil.todayStr });
        } else {
          results.actions.push({ routine: 'day', status: 'no_events', date: brazil.todayStr });
        }
      }
    }

    // =========================================================================
    // 3. LEMBRETE DE ANIVERSÁRIO DO DIA — 09:00
    // =========================================================================
    if (shouldRunBday) {
      const lockKey = `cron_bday:${brazil.todayStr}`;
      let canSend = true;

      if (!bypassLock) {
        const { data: alreadySent } = await supabase
          .from('chat_reminders')
          .select('id')
          .eq('client_phone', recipient)
          .eq('title', lockKey)
          .eq('status', 'sent')
          .limit(1);

        if (alreadySent && alreadySent.length > 0) {
          canSend = false;
          results.actions.push({ routine: 'bday', status: 'skipped_already_sent', date: brazil.todayStr });
        }
      }

      if (canSend) {
        // Busca conversas com data de nascimento preenchida
        const { data: convs, error: convErr } = await supabase
          .from('conversations')
          .select('id, client_name, client_phone, birth_or_foundation_date')
          .not('birth_or_foundation_date', 'is', null);

        if (convErr) throw convErr;

        const currentYear = parseInt(brazil.todayStr.slice(0, 4), 10);
        const bdayClients = [];

        (convs || []).forEach(c => {
          if (!c.birth_or_foundation_date) return;
          const rawDate = String(c.birth_or_foundation_date).slice(0, 10);
          const parts = rawDate.split('-');
          if (parts.length >= 3) {
            const clientMonthDay = `${parts[1]}-${parts[2]}`;
            if (clientMonthDay === brazil.monthDay) {
              const birthYear = parseInt(parts[0], 10);
              const age = birthYear && birthYear > 1900 ? currentYear - birthYear : null;
              bdayClients.push({
                name: c.client_name || 'Cliente',
                phone: c.client_phone || 'Não informado',
                age,
                rawDate
              });
            }
          }
        });

        if (bdayClients.length > 0) {
          const listText = bdayClients.map((b, i) => {
            const ageText = b.age ? ` (${b.age} anos)` : '';
            return `${i + 1}. 👤 *${b.name}*${ageText}\n   📱 WhatsApp: ${b.phone}`;
          }).join('\n\n');

          const messageText = `🎂 *LEMBRETE DE ANIVERSÁRIO — Hoje (${brazil.formattedToday})*

Dr. Jonatas, hoje temos *${bdayClients.length}* cliente(s) completando aniversário:

${listText}

👉 Acesse a aba *Chat* ou *Clientes* no painel para enviar a mensagem de felicitações!
🔗 https://app.nevesecosta.com.br

_Assistente Neves & Costa_`;

          await sendWhatsAppMessage(recipient, messageText);

          // Registra na chat_reminders para idempotência
          await supabase.from('chat_reminders').insert([{
            client_phone: recipient,
            type: 'cron_bday',
            title: lockKey,
            message: messageText,
            scheduled_for: new Date().toISOString(),
            sent_at: new Date().toISOString(),
            status: 'sent',
            created_by: 'daily_cron'
          }]);

          results.actions.push({ routine: 'bday', status: 'sent', count: bdayClients.length, clients: bdayClients.map(c => c.name) });
        } else {
          results.actions.push({ routine: 'bday', status: 'no_birthdays_today', date: brazil.todayStr });
        }
      }
    }

    return res.status(200).json({
      success: true,
      recipient,
      results
    });
  } catch (error) {
    safeError('daily_cron_error', error, { route: '/api/cron/daily-notifications' });
    return res.status(500).json({ error: error.message || 'Erro ao processar notificações diárias' });
  }
}
