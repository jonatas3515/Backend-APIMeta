-- ============================================================================
-- MIGRATION 045: Recriar view agenda_consolidada e função get_agenda de forma segura
-- ============================================================================
-- Aditiva / não destrutiva: CREATE OR REPLACE e grant de permissões.
-- Corrige possíveis incompatibilidades de tipos e ausência de permissão
-- executar função / acessar view.
-- ============================================================================

-- Garantir permissões para o role anon/authenticated (Supabase postgREST)
GRANT SELECT ON public.agenda_consolidada TO anon, authenticated;

CREATE OR REPLACE VIEW agenda_consolidada AS
SELECT 
  'case_deadline' as item_type,
  c.id as case_id,
  NULL::UUID as reminder_id,
  c.conversation_id,
  c.title as title,
  c.deadline_date as event_date,
  NULL::TIME as event_time,
  c.deadline_type as event_type,
  c.notes as description,
  c.priority,
  c.legal_area,
  c.case_type,
  c.municipality,
  c.agency,
  c.client_role,
  c.status,
  c.created_at
FROM cases c
WHERE c.deadline_date IS NOT NULL
  AND c.status NOT IN ('encerrado', 'cancelado')

UNION ALL

SELECT 
  'reminder' as item_type,
  cr.case_id,
  cr.id as reminder_id,
  cr.conversation_id,
  COALESCE(cr.message, 'Lembrete') as title,
  cr.scheduled_for::DATE as event_date,
  cr.scheduled_for::TIME as event_time,
  cr.reminder_type as event_type,
  cr.message as description,
  cr.priority,
  NULLIF(c.legal_area, '') as legal_area,
  NULLIF(c.case_type, '') as case_type,
  NULLIF(c.municipality, '') as municipality,
  NULLIF(c.agency, '') as agency,
  NULLIF(c.client_role, '') as client_role,
  NULL as status,
  cr.created_at
FROM chat_reminders cr
LEFT JOIN conversations c ON cr.conversation_id = c.id
WHERE cr.status = 'pending'
  AND cr.scheduled_for::DATE >= CURRENT_DATE

UNION ALL

SELECT 
  'case_event' as item_type,
  ce.case_id,
  NULL::UUID as reminder_id,
  c.id as conversation_id,
  COALESCE(ce.description, 'Evento') as title,
  ce.event_date,
  ce.event_time,
  ce.event_type,
  ce.description,
  ce.priority,
  NULLIF(c.legal_area, '') as legal_area,
  NULLIF(c.case_type, '') as case_type,
  NULLIF(c.municipality, '') as municipality,
  NULLIF(c.agency, '') as agency,
  NULLIF(c.client_role, '') as client_role,
  c.status,
  ce.created_at
FROM case_events ce
JOIN cases c ON ce.case_id = c.id
WHERE ce.event_date >= CURRENT_DATE;

COMMENT ON VIEW agenda_consolidada IS 'View que consolida prazos de cases, lembretes e eventos em uma única agenda (corrigida v2)';

-- Remove a função antiga caso o tipo de retorno tenha mudado
DROP FUNCTION IF EXISTS get_agenda(DATE, DATE, VARCHAR, VARCHAR, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION get_agenda(
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_end_date DATE DEFAULT CURRENT_DATE + INTERVAL '30 days',
  p_legal_area VARCHAR DEFAULT NULL,
  p_municipality VARCHAR DEFAULT NULL,
  p_agency VARCHAR DEFAULT NULL,
  p_priority VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  item_type VARCHAR,
  case_id UUID,
  reminder_id UUID,
  conversation_id UUID,
  title TEXT,
  event_date DATE,
  event_time TIME,
  event_type VARCHAR,
  priority VARCHAR,
  legal_area VARCHAR,
  case_type VARCHAR,
  municipality VARCHAR,
  agency VARCHAR,
  client_role VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ac.item_type,
    ac.case_id,
    ac.reminder_id,
    ac.conversation_id,
    ac.title::TEXT,
    ac.event_date,
    ac.event_time,
    ac.event_type,
    ac.priority,
    ac.legal_area,
    ac.case_type,
    ac.municipality,
    ac.agency,
    ac.client_role
  FROM agenda_consolidada ac
  WHERE ac.event_date BETWEEN p_start_date AND p_end_date
    AND (p_legal_area IS NULL OR p_legal_area = '' OR ac.legal_area = p_legal_area)
    AND (p_municipality IS NULL OR p_municipality = '' OR ac.municipality = p_municipality)
    AND (p_agency IS NULL OR p_agency = '' OR ac.agency = p_agency)
    AND (p_priority IS NULL OR p_priority = '' OR ac.priority = p_priority)
  ORDER BY ac.event_date ASC, ac.priority DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_agenda IS 'Busca itens da agenda com filtros opcionais (idempotente)';

GRANT EXECUTE ON FUNCTION get_agenda TO anon, authenticated;
