import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export async function loadClientMemory(conversationId, phone) {
  if (!supabase || !conversationId) return null;

  try {
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle();

    if (convError || !conv) {
      console.warn('[CLIENT-MEMORY] Conversa não encontrada:', convError?.message);
      return null;
    }

    const { data: cases } = await supabase
      .from('cases')
      .select('*')
      .eq('conversation_id', conversationId)
      .neq('status', 'encerrado')
      .order('created_at', { ascending: false })
      .limit(1);

    const activeCase = cases?.[0] || null;

    let processes = [];
    if (activeCase) {
      const { data } = await supabase
        .from('case_processes')
        .select('*')
        .eq('case_id', activeCase.id)
        .order('last_checked_at', { ascending: false })
        .limit(5);
      processes = data || [];
    }

    const { data: reminders } = await supabase
      .from('chat_reminders')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('status', 'pending')
      .order('scheduled_for', { ascending: true })
      .limit(10);

    const { data: infoRequests } = await supabase
      .from('client_info_requests')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(5);

    let insights = [];
    if (conv.legal_area) {
      let query = supabase
        .from('case_insights')
        .select('*')
        .eq('legal_area', conv.legal_area)
        .order('created_at', { ascending: false })
        .limit(3);

      if (conv.case_type) query = query.eq('case_type', conv.case_type);

      const { data } = await query;
      insights = data || [];
    }

    return {
      conv,
      activeCase,
      processes,
      reminders,
      infoRequests,
      insights,
      phone
    };
  } catch (error) {
    console.error('[CLIENT-MEMORY] Erro ao carregar memória:', error);
    return null;
  }
}

export function formatClientMemory(memory) {
  if (!memory) return '';

  const { conv, activeCase, processes, reminders, infoRequests, insights } = memory;
  const sections = [];

  if (conv) {
    const facts = [
      conv.case_type ? `Tipo: ${conv.case_type}` : null,
      conv.municipality ? `Município: ${conv.municipality}` : null,
      conv.agency ? `Órgão: ${conv.agency}` : null,
      conv.client_role ? `Papel: ${conv.client_role}` : null,
      conv.case_summary ? `Resumo: ${conv.case_summary}` : null,
    ].filter(Boolean);

    if (facts.length) sections.push(`DADOS DO CLIENTE\n${facts.join('\n')}`);
  }

  if (activeCase) {
    const deadline = activeCase.deadline_date
      ? new Date(activeCase.deadline_date).toLocaleDateString('pt-BR')
      : 'Sem prazo';

    sections.push(
      `CASO ATIVO\n- Status: ${activeCase.status || 'Não especificado'}\n- Etapa: ${activeCase.funnel_stage || 'Não especificada'}\n- Prazo: ${deadline}`
    );
  }

  if (processes && processes.length > 0) {
    const list = processes
      .map(
        (p) =>
          `- ${p.process_number_normalized || p.process_number || 'sem número'}: ${p.last_movement_summary || 'sem movimentação recente'}`
      )
      .join('\n');
    sections.push(`PROCESSOS MONITORADOS\n${list}`);
  }

  if (reminders && reminders.length > 0) {
    const list = reminders
      .map((r) => `- ${r.title || r.message || r.reminder_type}`)
      .join('\n');
    sections.push(`PENDÊNCIAS\n${list}`);
  }

  if (infoRequests && infoRequests.length > 0) {
    const last = infoRequests[0];
    sections.push(
      `ÚLTIMA CONSULTA DO CLIENTE\n- Tipo: ${last.intent_type}\n- Pergunta: ${last.request_text}`
    );
  }

  if (insights && insights.length > 0) {
    const list = insights
      .map((i) => `- ${i.legal_area}/${i.case_type}: ${(i.summary || '').substring(0, 200)}`)
      .join('\n');
    sections.push(`APRENDIZADO DE CASOS SEMELHANTES\n${list}`);
  }

  if (sections.length === 0) return '';

  return `MEMÓRIA DO CLIENTE (informações confirmadas no sistema):\n\n${sections.join(
    '\n\n'
  )}\n\nREGRAS DE RESPOSTA:\n- Baseie-se APENAS nas informações acima.\n- Se o cliente perguntar algo que não consta, responda: "Não tenho essa informação no momento."\n- Não repita saudações ou informações já ditas.\n- Não prometa resultados. Não dê parecer jurídico conclusivo.`;
}
