import { normalizeLegalArea } from './legalAreas';

export const DOCUMENT_STATUS_LABELS = {
  pendente: 'Pendente',
  solicitado: 'Solicitado',
  recebido: 'Recebido',
  em_revisao: 'Em revisão',
  revisado: 'Revisado',
  recusado: 'Recusado',
  dispensado: 'Dispensado'
};

export const DOCUMENT_STATUS_COLORS = {
  pendente: 'bg-gray-100 text-gray-800 border-gray-200',
  solicitado: 'bg-blue-100 text-blue-800 border-blue-200',
  recebido: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  em_revisao: 'bg-orange-100 text-orange-800 border-orange-200',
  revisado: 'bg-green-100 text-green-800 border-green-200',
  recusado: 'bg-red-100 text-red-800 border-red-200',
  dispensado: 'bg-purple-100 text-purple-800 border-purple-200'
};

const REQUEST_TEMPLATE = {
  key: 'document_request_v1',
  intro: 'Para darmos andamento, precisamos que voca envie os documentos a seguir:',
  item: '{i}. {title}: {description}',
  footer: 'Envie em fotos ou PDFs claros, um documento por vez. Quando recebermos, confirmaremos aqui.'
};

/**
 * Busca templates de checklist aplicaveis a um caso:
 *  - itens comuns (is_common = true)
 *  - itens da area especifica, normalizando legacy 'consumidor' -> 'consumerista'
 *  - ativos
 */
export async function getChecklistTemplatesForCase(supabase, caseData) {
  if (!supabase || !caseData) return [];

  const normalizedArea = normalizeLegalArea(caseData.legal_area);
  const caseType = (caseData.case_type || '').trim();

  let query = supabase
    .from('document_checklist_templates')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('document_name', { ascending: true });

  const orFilters = ['is_common.eq.true'];
  if (normalizedArea) orFilters.push(`legal_area.eq.${normalizedArea}`);

  query = query.or(orFilters.join(','));

  const { data, error } = await query;

  if (error) {
    console.error('[DOCUMENT_CHECKLISTS] Erro ao buscar templates');
    throw error;
  }

  const list = data || [];

  if (!caseType) return list;

  // Prioriza itens com case_type compativel (exato ou 'geral'); requer fuzzy minimo
  return list
    .map(t => ({
      ...t,
      _relevance: (t.case_type || '').toLowerCase() === caseType.toLowerCase() ? 2
        : (t.case_type || '').toLowerCase() === 'geral' ? 1
        : t.is_common ? 1
        : 0
    }))
    .filter(t => t._relevance > 0)
    .sort((a, b) => (b._relevance - a._relevance) || (a.sort_order - b.sort_order));
}

/**
 * Constroi mensagem de solicitacao (draft) para envio via WhatsApp.
 * Nao inclui PII, links, URLs assinadas, notas internas, RAG, diagnostico ou promessas.
 * Retorna { message, template_key }.
 */
export function buildDocumentRequestMessage(items) {
  const valid = (items || []).filter(i => i.title);
  const body = valid.map((item, idx) => {
    const title = item.title || item.document_name;
    const description = item.description || title;
    return REQUEST_TEMPLATE.item
      .replace('{i}', idx + 1)
      .replace('{title}', title)
      .replace('{description}', description);
  }).join('\n\n');

  const message = `${REQUEST_TEMPLATE.intro}\n\n${body}\n\n${REQUEST_TEMPLATE.footer}`;
  return { message, template_key: REQUEST_TEMPLATE.key };
}

/**
 * Valida se um estagiario pode alterar um checklist para o novo status.
 */
export function isValidStatusForEstagiario(status) {
  return status === 'recebido' || status === 'em_revisao';
}

/**
 * Lista de campos que estagiario nao pode alterar via PATCH.
 */
export const RESTRICTED_FIELDS_FOR_ESTAGIARIO = new Set([
  'case_id', 'template_id', 'document_name', 'is_sensitive', 'is_required',
  'reviewed_by', 'reviewed_at', 'dispensed_by', 'dispensed_at', 'dispense_reason'
]);
