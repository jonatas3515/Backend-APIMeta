import { createClient } from '@supabase/supabase-js';
import { withAuth, requireRole } from '@/lib/auth';
import { calculateRegionalSuggestion } from '@/lib/feeSuggestion';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

function normalizeText(value) {
  if (value == null) return '';
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function parseAmount(value) {
  if (value == null || value === '') return null;
  const cleaned = String(value)
    .replace(/R\$|USD|\$/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .trim();
  const parsed = Number(cleaned);
  return isNaN(parsed) ? null : parsed;
}

function extractReferences(tableData) {
  if (!Array.isArray(tableData)) return [];

  const refs = [];
  let currentArea = 'Geral';

  for (const row of tableData) {
    const keys = Object.keys(row || {});
    if (keys.length === 0) continue;

    // Coleta numeros, valores monetarios em string e a descricao
    const numeros = [];
    let descricao = '';

    for (const key of keys) {
      const v = row[key];
      if (v == null || v === '') continue;

      const isNumber = typeof v === 'number';
      const s = String(v).trim();

      if (isNumber && v > 0) {
        numeros.push(v);
      } else if (!isNumber) {
        // Tenta extrair valor monetario de strings como "R$ 4.614,98" ou "R$ 65.151,10"
        const moneyMatch = s.match(/R\$\s*([\d.]+(?:,\d+)?)/);
        if (moneyMatch) {
          const parsed = parseAmount(moneyMatch[1]);
          if (parsed != null && parsed > 0) numeros.push(parsed);
        } else if (!/^\d+$/.test(s) && s.length > 1) {
          // Texto sem ser so numeros = descricao
          if (s.length > descricao.length) {
            descricao = s;
          }
        }
      }
    }

    // Ignora sem descricao ou sem valores
    if (numeros.length === 0 || !descricao) continue;

    // Ordena numeros: maior = valor real, menor = URH
    numeros.sort((a, b) => a - b);
    const urh = numeros.length > 1 ? numeros[0] : null;
    const valorReal = numeros[numeros.length - 1];

    // Detecta se descricao e area/categoria (texto todo em maiusculo ou sem numero no inicio)
    const limpa = descricao.replace(/\d/g, '').trim();
    const isUppercase = descricao === descricao.toUpperCase() && descricao.length > 10;
    if ((descricao && !/^\d/.test(descricao) && limpa.length > 0 && isUppercase) ||
        (descricao.length > 5 && !descricao.includes('.') && isUppercase)) {
      currentArea = limpa;
      continue;
    }

    // Formata nome do servico (remove numeros 1.1, 1.1.1)
    const nomeServico = descricao.replace(/^\d+[.\d]*/, '').trim();

    refs.push({
      id: `oab-${refs.length}`,
      legal_area: currentArea,
      case_type: '',
      service: nomeServico,
      min_amount: valorReal,
      suggested_amount: valorReal,
      max_amount: null,
      unit: urh ? `${urh} URH` : '',
      region: ''
    });
  }

  return refs;
}

async function handler(req, res) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  try {
    const { method } = req;
    const { legal_area, case_type, service, factor } = req.query;

    if (method === 'GET') {
      const { data: tables, error } = await supabaseAdmin
        .from('fee_uploaded_tables')
        .select('*')
        .eq('table_type', 'oab')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const all = [];
      for (const table of tables || []) {
        const refs = extractReferences(table.table_data);
        for (const ref of refs) {
          all.push({ ...ref, table_id: table.id, table_name: table.name });
        }
      }

      console.log('[FEE-REFERENCE] Total referencias extraidas:', all.length);
      console.log('[FEE-REFERENCE] Primeiras 3 referencias:', all.slice(0, 3).map(r => ({ area: r.legal_area, service: r.service })));
      console.log('[FEE-REFERENCE] Filtros:', { legal_area, case_type, service });

      let filtered = all;
      if (legal_area) {
        const norm = normalizeText(legal_area);
        filtered = filtered.filter((r) => normalizeText(r.legal_area).includes(norm));
        console.log('[FEE-REFERENCE] Apos filtro area:', filtered.length);
      }
      if (case_type) {
        const norm = normalizeText(case_type);
        filtered = filtered.filter((r) => normalizeText(r.case_type).includes(norm));
        console.log('[FEE-REFERENCE] Apos filtro tipo:', filtered.length);
      }
      if (service) {
        const norm = normalizeText(service);
        filtered = filtered.filter((r) => normalizeText(r.service).includes(norm));
        console.log('[FEE-REFERENCE] Apos filtro servico:', filtered.length);
      }

      const withSuggestion = filtered.map((r) => ({
        ...r,
        regional_suggestion: calculateRegionalSuggestion(r.suggested_amount, Number(factor) || 0.75)
      }));

      return res.status(200).json(withSuggestion);
    }

    if (method === 'POST') {
      requireRole(req.user, ['admin']);
      const { table_id, legal_area: la, case_type: ct, service: sv, min_amount, suggested_amount, max_amount, unit, region } = req.body;

      if (!table_id || !la || !sv) {
        return res.status(400).json({ error: 'table_id, legal_area e service são obrigatórios' });
      }

      const { data: table, error: tableError } = await supabaseAdmin
        .from('fee_uploaded_tables')
        .select('table_data')
        .eq('id', table_id)
        .single();

      if (tableError || !table) {
        return res.status(404).json({ error: 'Tabela não encontrada' });
      }

      const items = Array.isArray(table.table_data) ? table.table_data : [];
      const newItem = {
        legal_area: la,
        case_type: ct || '',
        service: sv,
        min_amount: min_amount != null ? parseAmount(min_amount) : null,
        suggested_amount: suggested_amount != null ? parseAmount(suggested_amount) : null,
        max_amount: max_amount != null ? parseAmount(max_amount) : null,
        unit: unit || '',
        region: region || ''
      };

      const { data, error } = await supabaseAdmin
        .from('fee_uploaded_tables')
        .update({ table_data: [...items, newItem] })
        .eq('id', table_id)
        .select()
        .single();

      if (error) throw error;
      await logAudit(req.user.id, 'fee_uploaded_tables', table_id, 'add_reference_item', null, newItem);
      return res.status(201).json(newItem);
    }

    if (method === 'PATCH') {
      requireRole(req.user, ['admin']);
      const { table_id, index } = req.query;
      if (!table_id || index === undefined) {
        return res.status(400).json({ error: 'table_id e index são obrigatórios' });
      }

      const { data: table, error: tableError } = await supabaseAdmin
        .from('fee_uploaded_tables')
        .select('table_data')
        .eq('id', table_id)
        .single();

      if (tableError || !table) {
        return res.status(404).json({ error: 'Tabela não encontrada' });
      }

      const items = Array.isArray(table.table_data) ? table.table_data : [];
      const idx = parseInt(index, 10);
      if (isNaN(idx) || idx < 0 || idx >= items.length) {
        return res.status(400).json({ error: 'Índice inválido' });
      }

      const old = items[idx];
      const updated = { ...old, ...req.body };
      items[idx] = updated;

      const { data, error } = await supabaseAdmin
        .from('fee_uploaded_tables')
        .update({ table_data: items })
        .eq('id', table_id)
        .select()
        .single();

      if (error) throw error;
      await logAudit(req.user.id, 'fee_uploaded_tables', table_id, 'update_reference_item', old, updated);
      return res.status(200).json(updated);
    }

    if (method === 'DELETE') {
      requireRole(req.user, ['admin']);
      const { table_id, index } = req.query;
      if (!table_id || index === undefined) {
        return res.status(400).json({ error: 'table_id e index são obrigatórios' });
      }

      const { data: table, error: tableError } = await supabaseAdmin
        .from('fee_uploaded_tables')
        .select('table_data')
        .eq('id', table_id)
        .single();

      if (tableError || !table) {
        return res.status(404).json({ error: 'Tabela não encontrada' });
      }

      const items = Array.isArray(table.table_data) ? table.table_data : [];
      const idx = parseInt(index, 10);
      if (isNaN(idx) || idx < 0 || idx >= items.length) {
        return res.status(400).json({ error: 'Índice inválido' });
      }

      const removed = items.splice(idx, 1)[0];
      const { data, error } = await supabaseAdmin
        .from('fee_uploaded_tables')
        .update({ table_data: items })
        .eq('id', table_id)
        .select()
        .single();

      if (error) throw error;
      await logAudit(req.user.id, 'fee_uploaded_tables', table_id, 'delete_reference_item', removed, null);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (error) {
    console.error('[FEE-REFERENCE] Erro:', error);
    return res.status(500).json({ error: error.message || 'Erro interno' });
  }
}

async function logAudit(userId, entityType, entityId, action, oldValue, newValue) {
  await supabaseAdmin.from('audit_logs').insert({
    user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    old_value: oldValue ? JSON.stringify(oldValue) : null,
    new_value: newValue ? JSON.stringify(newValue) : null,
    created_at: new Date().toISOString()
  });
}

export default withAuth(handler, { minRole: 'estagiario' });
