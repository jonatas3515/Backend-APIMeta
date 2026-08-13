import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

const MAX_PER_CATEGORY = 5;

function escapeLike(str) {
  return str.replace(/[\\%_]/g, '\\$&');
}

async function searchWithTimeout(promise, ms = 2000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), ms)
  );
  return Promise.race([promise, timeout]);
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const { q } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(200).json({
      conversations: [],
      cases: [],
      documents: [],
      insights: []
    });
  }

  const term = q.trim();
  const pattern = `%${escapeLike(term)}%`;

  try {
    const results = await Promise.allSettled([
      searchWithTimeout(searchConversations(pattern)),
      searchWithTimeout(searchCases(pattern)),
      searchWithTimeout(searchDocuments(pattern)),
      searchWithTimeout(searchInsights(pattern))
    ]);

    const [conversationsResult, casesResult, documentsResult, insightsResult] = results;

    const conversations = conversationsResult.status === 'fulfilled' ? conversationsResult.value : [];
    const cases = casesResult.status === 'fulfilled' ? casesResult.value : [];
    const documents = documentsResult.status === 'fulfilled' ? documentsResult.value : [];
    const insights = insightsResult.status === 'fulfilled' ? insightsResult.value : [];

    if (conversationsResult.status === 'rejected') {
      console.error('[SEARCH] Erro em conversations:', conversationsResult.reason.message);
    }
    if (casesResult.status === 'rejected') {
      console.error('[SEARCH] Erro em cases:', casesResult.reason.message);
    }
    if (documentsResult.status === 'rejected') {
      console.error('[SEARCH] Erro em documents:', documentsResult.reason.message);
    }
    if (insightsResult.status === 'rejected') {
      console.error('[SEARCH] Erro em insights:', insightsResult.reason.message);
    }

    return res.status(200).json({
      conversations,
      cases,
      documents,
      insights
    });
  } catch (error) {
    console.error('[SEARCH] Erro geral:', error);
    return res.status(500).json({ error: 'Erro ao realizar busca' });
  }
}

async function searchConversations(pattern) {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, client_name, client_phone, legal_area, case_type, status')
    .or(`client_name.ilike.${pattern}, client_phone.ilike.${pattern}`)
    .limit(MAX_PER_CATEGORY);

  if (error) throw error;

  // Também busca mensagens que contenham o termo
  const { data: messagesData, error: messagesError } = await supabase
    .from('messages')
    .select('text, conversation_id')
    .ilike('text', pattern)
    .limit(MAX_PER_CATEGORY * 3);

  if (messagesError) throw messagesError;

  const conversationIdsFromMessages = messagesData?.map(m => m.conversation_id).filter(Boolean) || [];

  if (conversationIdsFromMessages.length > 0) {
    const { data: convFromMessages } = await supabase
      .from('conversations')
      .select('id, client_name, client_phone, legal_area, case_type, status')
      .in('id', conversationIdsFromMessages)
      .limit(MAX_PER_CATEGORY);

    if (convFromMessages?.length > 0) {
      const byId = new Map(data?.map(c => [c.id, c]));
      convFromMessages.forEach(c => {
        if (!byId.has(c.id)) {
          data.push(c);
        }
      });
    }
  }

  return (data || []).slice(0, MAX_PER_CATEGORY).map(c => ({
    id: c.id,
    title: c.client_name || c.client_phone,
    subtitle: c.client_phone ? `Telefone: ${c.client_phone}` : '',
    meta: [c.legal_area, c.case_type, c.status].filter(Boolean).join(' • '),
    type: 'conversation',
    href: `/?tab=chat&conversation=${c.id}`
  }));
}

async function searchCases(pattern) {
  const { data, error } = await supabase
    .from('cases')
    .select('id, title, client_name, legal_area, municipality, agency, status')
    .or(`title.ilike.${pattern}, client_name.ilike.${pattern}, legal_area.ilike.${pattern}, municipality.ilike.${pattern}, agency.ilike.${pattern}`)
    .limit(MAX_PER_CATEGORY);

  if (error) throw error;

  return (data || []).map(c => ({
    id: c.id,
    title: c.title || c.client_name,
    subtitle: c.client_name ? `Cliente: ${c.client_name}` : '',
    meta: [c.legal_area, c.municipality, c.agency, c.status].filter(Boolean).join(' • '),
    type: 'case',
    href: `/?tab=cases&case=${c.id}`
  }));
}

async function searchDocuments(pattern) {
  let templateRows = [];
  let routineRows = [];

  try {
    const { data, error } = await supabase
      .from('document_templates')
      .select('id, name, description, legal_area, case_type')
      .or(`name.ilike.${pattern}, description.ilike.${pattern}, legal_area.ilike.${pattern}`)
      .eq('is_active', true)
      .limit(MAX_PER_CATEGORY);
    if (error) throw error;
    templateRows = data || [];
  } catch (err) {
    console.warn('[SEARCH] Tabela document_templates indisponível:', err.message);
  }

  try {
    const { data, error } = await supabase
      .from('legal_routines')
      .select('id, name, description, legal_area, case_type, funnel_stage')
      .or(`name.ilike.${pattern}, description.ilike.${pattern}`)
      .eq('is_active', true)
      .limit(MAX_PER_CATEGORY);
    if (error) throw error;
    routineRows = data || [];
  } catch (err) {
    console.warn('[SEARCH] Tabela legal_routines indisponível:', err.message);
  }

  const templateResults = templateRows.map(t => ({
    id: t.id,
    title: t.name,
    subtitle: t.description || 'Template de documento',
    meta: [t.legal_area, t.case_type].filter(Boolean).join(' • '),
    type: 'document',
    kind: 'template',
    href: `/?tab=templates&id=${t.id}`
  }));

  const routineResults = routineRows.map(r => ({
    id: r.id,
    title: r.name,
    subtitle: r.description || 'Rotina jurídica',
    meta: [r.legal_area, r.case_type, r.funnel_stage].filter(Boolean).join(' • '),
    type: 'document',
    kind: 'routine',
    href: `/?tab=routines&id=${r.id}`
  }));

  return [...templateResults, ...routineResults].slice(0, MAX_PER_CATEGORY);
}

async function searchInsights(pattern) {
  try {
    const { data, error } = await supabase
      .from('case_insights')
      .select('id, legal_area, case_type, municipality, agency, summary, confidential')
      .or(`summary.ilike.${pattern}, strategy_notes.ilike.${pattern}, risk_notes.ilike.${pattern}, outcome_notes.ilike.${pattern}, similar_patterns.ilike.${pattern}`)
      .eq('confidential', false)
      .limit(MAX_PER_CATEGORY);

    if (error) throw error;

    return (data || []).map(i => ({
      id: i.id,
      title: `${i.legal_area || 'Insight'}: ${i.case_type || ''}`.trim(),
      subtitle: i.summary?.substring(0, 80) || 'Aprendizado de caso encerrado',
      meta: [i.municipality, i.agency].filter(Boolean).join(' • '),
      type: 'insight',
      href: `/?tab=insights&id=${i.id}`
    }));
  } catch (err) {
    console.warn('[SEARCH] Tabela case_insights indisponível:', err.message);
    return [];
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
