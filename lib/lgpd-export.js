import logger from './logger';

const MAX_MESSAGES = 1000;
const MAX_CASES = 100;
const MAX_DOCUMENTS = 100;
const MAX_CONSENTS = 100;
const MAX_AUDIT = 100;

function flattenObject(prefix, obj) {
  const rows = [];
  if (obj === null || obj === undefined) return rows;

  if (typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj)) {
      const field = prefix ? `${prefix}.${key}` : key;
      if (value === null || value === undefined) continue;
      if (typeof value === 'object' && !Array.isArray(value)) {
        rows.push(...flattenObject(field, value));
      } else if (Array.isArray(value)) {
        rows.push({ field, value: value.length });
      } else {
        rows.push({ field, value });
      }
    }
  } else if (Array.isArray(obj)) {
    rows.push({ field: prefix || 'value', value: obj.length });
  } else {
    rows.push({ field: prefix || 'value', value: obj });
  }

  return rows;
}

function formatCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function buildExport({ supabase, conversationId, format = 'json' }) {
  const start = Date.now();

  logger('info', 'LGPD_EXPORT_START', {
    action: 'export_data',
    conversationId,
    format
  });

  const result = {
    exportedAt: new Date().toISOString(),
    subject: { id: conversationId, type: 'conversation' },
    profile: null,
    cases: [],
    messages: [],
    documentRequests: [],
    generatedDocuments: [],
    consents: [],
    feeSimulations: [],
    auditSummary: []
  };

  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (convError || !conversation) {
    throw Object.assign(new Error('Titular não encontrado'), { code: 'NOT_FOUND' });
  }

  const profile = {
    id: conversation.id,
    client_name: conversation.client_name,
    client_phone: conversation.client_phone,
    client_email: conversation.client_email || null,
    client_cpf_cnpj: conversation.client_cpf_cnpj || null,
    municipality: conversation.municipality || null,
    state: conversation.state || null,
    agency: conversation.agency || null,
    client_role: conversation.client_role || null,
    legal_area: conversation.legal_area || null,
    case_type: conversation.case_type || null,
    case_summary: conversation.case_summary || null,
    status: conversation.status,
    client_status: conversation.client_status,
    funnel_stage: conversation.funnel_stage,
    is_client: conversation.is_client,
    is_sensitive: conversation.is_sensitive,
    confidential: conversation.confidential,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
    first_contact_at: conversation.first_contact_at || conversation.created_at,
    lead_created_at: conversation.lead_created_at,
    lead_last_contact_at: conversation.lead_last_contact_at,
    intake_data: conversation.intake_data || {}
  };

  result.profile = profile;

  const { data: cases, error: casesError } = await supabase
    .from('cases')
    .select('id, title, legal_area, case_type, municipality, agency, client_role, status, priority, deadline_date, deadline_type, notes, created_at, updated_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MAX_CASES);

  if (casesError) {
    logger('error', 'LGPD_EXPORT_CASES_ERROR', { conversationId, errorCode: 'EXPORT_CASES_FAILED' });
  } else {
    result.cases = (cases || []).map(c => ({
      id: c.id,
      title: c.title,
      legal_area: c.legal_area,
      case_type: c.case_type,
      municipality: c.municipality,
      agency: c.agency,
      client_role: c.client_role,
      status: c.status,
      priority: c.priority,
      deadline_date: c.deadline_date,
      deadline_type: c.deadline_type,
      notes: c.notes,
      created_at: c.created_at,
      updated_at: c.updated_at
    }));
  }

  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('id, direction, sender_type, content_type, text, media_url, status, is_sensitive, sensitive_reason, created_at, wa_message_id')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MAX_MESSAGES);

  if (messagesError) {
    logger('error', 'LGPD_EXPORT_MESSAGES_ERROR', { conversationId, errorCode: 'EXPORT_MESSAGES_FAILED' });
  } else {
    result.messages = (messages || []).map(m => ({
      id: m.id,
      direction: m.direction,
      sender_type: m.sender_type,
      content_type: m.content_type,
      text: m.text,
      media_url: m.media_url || null,
      status: m.status,
      is_sensitive: m.is_sensitive,
      sensitive_reason: m.sensitive_reason,
      created_at: m.created_at,
      wa_message_id: m.wa_message_id
    }));
  }

  const { data: docsReq, error: docsReqError } = await supabase
    .from('document_checklist_requests')
    .select('id, case_id, conversation_id, items, status, requested_at, requested_by, wa_message_id, message_template_key, batch_number, completed_at, client_message')
    .eq('conversation_id', conversationId)
    .order('requested_at', { ascending: false })
    .limit(MAX_DOCUMENTS);

  if (docsReqError) {
    logger('error', 'LGPD_EXPORT_DOC_REQUESTS_ERROR', { conversationId, errorCode: 'EXPORT_DOC_REQUESTS_FAILED' });
  } else {
    result.documentRequests = docsReq || [];
  }

  const { data: genDocs, error: genDocsError } = await supabase
    .from('generated_documents')
    .select('id, case_id, conversation_id, template_id, name, legal_area, case_type, content, status, created_at, updated_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MAX_DOCUMENTS);

  if (genDocsError) {
    logger('error', 'LGPD_EXPORT_GENERATED_DOCS_ERROR', { conversationId, errorCode: 'EXPORT_GENERATED_DOCS_FAILED' });
  } else {
    result.generatedDocuments = (genDocs || []).map(d => ({
      id: d.id,
      case_id: d.case_id,
      template_id: d.template_id,
      name: d.name,
      legal_area: d.legal_area,
      case_type: d.case_type,
      status: d.status,
      created_at: d.created_at,
      updated_at: d.updated_at
    }));
  }

  const { data: consents, error: consentsError } = await supabase
    .from('consent_logs')
    .select('id, consent_type, value, ip_address, user_agent, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MAX_CONSENTS);

  if (consentsError) {
    logger('error', 'LGPD_EXPORT_CONSENTS_ERROR', { conversationId, errorCode: 'EXPORT_CONSENTS_FAILED' });
  } else {
    result.consents = consents || [];
  }

  const { data: feeSims, error: feeSimsError } = await supabase
    .from('fee_simulations')
    .select('id, case_id, conversation_id, data, total, created_at, updated_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MAX_DOCUMENTS);

  if (feeSimsError) {
    logger('error', 'LGPD_EXPORT_FEE_SIMS_ERROR', { conversationId, errorCode: 'EXPORT_FEE_SIMS_FAILED' });
  } else {
    result.feeSimulations = feeSims || [];
  }

  const { data: audit, error: auditError } = await supabase
    .from('audit_logs')
    .select('id, user_id, entity_type, entity_id, action, old_value, new_value, created_at')
    .or(`entity_id.eq.${conversationId},and(entity_type.eq.conversation,entity_id.eq.${conversationId})`)
    .order('created_at', { ascending: false })
    .limit(MAX_AUDIT);

  if (auditError) {
    logger('error', 'LGPD_EXPORT_AUDIT_ERROR', { conversationId, errorCode: 'EXPORT_AUDIT_FAILED' });
  } else {
    result.auditSummary = (audit || []).map(a => ({
      id: a.id,
      user_id: a.user_id,
      entity_type: a.entity_type,
      entity_id: a.entity_id,
      action: a.action,
      old_value: a.old_value,
      new_value: a.new_value,
      created_at: a.created_at
    }));
  }

  logger('info', 'LGPD_EXPORT_SUCCESS', {
    action: 'export_data',
    conversationId,
    format,
    durationMs: Date.now() - start
  });

  if (format === 'csv') {
    return toCsv(result, conversationId);
  }

  return result;
}

function toCsv(result, conversationId) {
  const lines = ['entity,id,field,value'];

  for (const row of flattenObject('', result.profile)) {
    lines.push(`client,${conversationId},${formatCsvValue(row.field)},${formatCsvValue(row.value)}`);
  }

  for (const c of result.cases) {
    for (const row of flattenObject('', c)) {
      lines.push(`case,${c.id},${formatCsvValue(row.field)},${formatCsvValue(row.value)}`);
    }
  }

  for (const m of result.messages) {
    for (const row of flattenObject('', m)) {
      lines.push(`message,${m.id},${formatCsvValue(row.field)},${formatCsvValue(row.value)}`);
    }
  }

  for (const d of result.documentRequests) {
    for (const row of flattenObject('', d)) {
      lines.push(`document_request,${d.id},${formatCsvValue(row.field)},${formatCsvValue(row.value)}`);
    }
  }

  for (const d of result.generatedDocuments) {
    for (const row of flattenObject('', d)) {
      lines.push(`generated_document,${d.id},${formatCsvValue(row.field)},${formatCsvValue(row.value)}`);
    }
  }

  for (const c of result.consents) {
    for (const row of flattenObject('', c)) {
      lines.push(`consent,${c.id},${formatCsvValue(row.field)},${formatCsvValue(row.value)}`);
    }
  }

  for (const f of result.feeSimulations) {
    for (const row of flattenObject('', f)) {
      lines.push(`fee_simulation,${f.id},${formatCsvValue(row.field)},${formatCsvValue(row.value)}`);
    }
  }

  for (const a of result.auditSummary) {
    for (const row of flattenObject('', a)) {
      lines.push(`audit,${a.id},${formatCsvValue(row.field)},${formatCsvValue(row.value)}`);
    }
  }

  return lines.join('\n') + '\n';
}
