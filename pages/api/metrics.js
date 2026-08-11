import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export default async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  const { method } = req;

  try {
    if (method === 'GET') {
      return handleGet(req, res);
    } else {
      return res.status(405).json({ error: 'Método não permitido' });
    }
  } catch (error) {
    console.error('[METRICS] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

async function handleGet(req, res) {
  const { action, legal_area, municipality, agency, start_date, end_date } = req.query;

  try {
    if (action === 'cases-by-area') {
      return handleCasesByArea(res, legal_area, start_date, end_date);
    } else if (action === 'cases-by-type') {
      return handleCasesByType(res, legal_area, start_date, end_date);
    } else if (action === 'cases-by-location') {
      return handleCasesByLocation(res, start_date, end_date);
    } else if (action === 'funnel-conversion') {
      return handleFunnelConversion(res, start_date, end_date);
    } else if (action === 'time-series') {
      return handleTimeSeries(res, start_date, end_date);
    } else if (action === 'summary') {
      return handleSummary(res, start_date, end_date);
    } else {
      return res.status(400).json({ error: 'Ação não reconhecida' });
    }
  } catch (error) {
    console.error('[METRICS] Erro ao processar:', error);
    return res.status(500).json({ error: 'Erro ao processar métricas' });
  }
}

async function handleCasesByArea(res, legalArea, startDate, endDate) {
  let query = supabase
    .from('cases')
    .select('legal_area, id');

  if (legalArea) query = query.eq('legal_area', legalArea);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const { data, error } = await query;
  if (error) throw error;

  const grouped = {};
  data.forEach(item => {
    const area = item.legal_area || 'Não especificada';
    grouped[area] = (grouped[area] || 0) + 1;
  });

  const result = Object.entries(grouped)
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count);

  return res.status(200).json(result);
}

async function handleCasesByType(res, legalArea, startDate, endDate) {
  let query = supabase
    .from('cases')
    .select('case_type, legal_area, id');

  if (legalArea) query = query.eq('legal_area', legalArea);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const { data, error } = await query;
  if (error) throw error;

  const grouped = {};
  data.forEach(item => {
    const type = item.case_type || 'Não especificado';
    grouped[type] = (grouped[type] || 0) + 1;
  });

  const result = Object.entries(grouped)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return res.status(200).json(result);
}

async function handleCasesByLocation(res, startDate, endDate) {
  let query = supabase
    .from('cases')
    .select('municipality, agency, legal_area, id');

  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const { data, error } = await query;
  if (error) throw error;

  const grouped = {};
  data.forEach(item => {
    const key = `${item.municipality || 'Não especificado'}|${item.agency || 'Não especificado'}`;
    if (!grouped[key]) {
      grouped[key] = { municipality: item.municipality, agency: item.agency, count: 0, areas: {} };
    }
    grouped[key].count += 1;
    const area = item.legal_area || 'Geral';
    grouped[key].areas[area] = (grouped[key].areas[area] || 0) + 1;
  });

  const result = Object.values(grouped)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return res.status(200).json(result);
}

async function handleFunnelConversion(res, startDate, endDate) {
  let query = supabase
    .from('conversations')
    .select('funnel_stage, id');

  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const { data, error } = await query;
  if (error) throw error;

  const stages = [
    'lead_novo',
    'intake_em_andamento',
    'intake_concluido',
    'proposta_enviada',
    'contrato_assinado',
    'acao_protocolada',
    'aguardando_decisao',
    'encerrado'
  ];

  const stageLabels = {
    'lead_novo': 'Leads Novos',
    'intake_em_andamento': 'Intake em Andamento',
    'intake_concluido': 'Intake Concluído',
    'proposta_enviada': 'Proposta Enviada',
    'contrato_assinado': 'Contrato Assinado',
    'acao_protocolada': 'Ação Protocolada',
    'aguardando_decisao': 'Aguardando Decisão',
    'encerrado': 'Encerrado'
  };

  const counts = {};
  stages.forEach(stage => {
    counts[stage] = data.filter(item => item.funnel_stage === stage).length;
  });

  const result = stages.map((stage, idx) => {
    const count = counts[stage];
    const prevCount = idx === 0 ? counts[stage] : counts[stages[idx - 1]];
    const conversionRate = prevCount > 0 ? Math.round((count / prevCount) * 100) : 100;

    return {
      stage,
      label: stageLabels[stage],
      count,
      conversionRate: idx === 0 ? 100 : conversionRate
    };
  });

  return res.status(200).json(result);
}

async function handleTimeSeries(res, startDate, endDate) {
  // Define intervalo padrão (últimos 6 meses)
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

  let convQuery = supabase
    .from('conversations')
    .select('created_at, id');

  if (startDate) convQuery = convQuery.gte('created_at', startDate);
  if (endDate) convQuery = convQuery.lte('created_at', endDate);

  const { data: conversations, error: convError } = await convQuery;
  if (convError) throw convError;

  let caseQuery = supabase
    .from('cases')
    .select('created_at, status, id');

  if (startDate) caseQuery = caseQuery.gte('created_at', startDate);
  if (endDate) caseQuery = caseQuery.lte('created_at', endDate);

  const { data: cases, error: caseError } = await caseQuery;
  if (caseError) throw caseError;

  // Agrupa por mês
  const monthlyData = {};
  const current = new Date(start);

  while (current <= end) {
    const monthKey = current.toISOString().slice(0, 7); // YYYY-MM
    monthlyData[monthKey] = {
      month: monthKey,
      conversations: 0,
      cases: 0,
      closed: 0
    };
    current.setMonth(current.getMonth() + 1);
  }

  conversations.forEach(conv => {
    const monthKey = new Date(conv.created_at).toISOString().slice(0, 7);
    if (monthlyData[monthKey]) monthlyData[monthKey].conversations += 1;
  });

  cases.forEach(c => {
    const monthKey = new Date(c.created_at).toISOString().slice(0, 7);
    if (monthlyData[monthKey]) {
      monthlyData[monthKey].cases += 1;
      if (c.status === 'encerrado') monthlyData[monthKey].closed += 1;
    }
  });

  const result = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));

  return res.status(200).json(result);
}

async function handleSummary(res, startDate, endDate) {
  // Busca dados agregados
  let caseQuery = supabase
    .from('cases')
    .select('legal_area, case_type, municipality, agency, status, id');

  if (startDate) caseQuery = caseQuery.gte('created_at', startDate);
  if (endDate) caseQuery = caseQuery.lte('created_at', endDate);

  const { data: cases, error } = await caseQuery;
  if (error) throw error;

  // Calcula agregados
  const areas = {};
  const types = {};
  const municipalities = {};
  const agencies = {};

  cases.forEach(c => {
    areas[c.legal_area || 'Geral'] = (areas[c.legal_area || 'Geral'] || 0) + 1;
    types[c.case_type || 'Geral'] = (types[c.case_type || 'Geral'] || 0) + 1;
    municipalities[c.municipality || 'Não especificado'] = (municipalities[c.municipality || 'Não especificado'] || 0) + 1;
    agencies[c.agency || 'Não especificado'] = (agencies[c.agency || 'Não especificado'] || 0) + 1;
  });

  const topArea = Object.entries(areas).sort((a, b) => b[1] - a[1])[0];
  const topType = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
  const topMunicipality = Object.entries(municipalities).sort((a, b) => b[1] - a[1])[0];
  const topAgency = Object.entries(agencies).sort((a, b) => b[1] - a[1])[0];

  const summary = {
    total_cases: cases.length,
    top_area: topArea ? { name: topArea[0], count: topArea[1] } : null,
    top_type: topType ? { name: topType[0], count: topType[1] } : null,
    top_municipality: topMunicipality ? { name: topMunicipality[0], count: topMunicipality[1] } : null,
    top_agency: topAgency ? { name: topAgency[0], count: topAgency[1] } : null,
    areas_count: Object.keys(areas).length,
    types_count: Object.keys(types).length,
    municipalities_count: Object.keys(municipalities).length,
    agencies_count: Object.keys(agencies).length
  };

  return res.status(200).json(summary);
}
