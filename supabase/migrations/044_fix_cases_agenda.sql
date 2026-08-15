-- ============================================================================
-- MIGRATION 044: Permitir casos sem conversa e corrigir view agenda_consolidada
-- ============================================================================
-- Não destrutiva: ALTER TABLE DROP NOT NULL e recriação de view corrigida.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tornar conversation_id opcional em cases
-- ----------------------------------------------------------------------------
ALTER TABLE public.cases 
  ALTER COLUMN conversation_id DROP NOT NULL;

-- ----------------------------------------------------------------------------
-- 1.2. Garantir que case_events exista
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_time TIME,
  event_type VARCHAR(100) NOT NULL,
  description TEXT,
  priority VARCHAR(20) DEFAULT 'media' CHECK (priority IN ('baixa', 'media', 'alta')),
  location VARCHAR(255),
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_events_case ON public.case_events(case_id);
CREATE INDEX IF NOT EXISTS idx_case_events_date ON public.case_events(event_date);

-- ----------------------------------------------------------------------------
-- 1.5. Garantir que chat_reminders tenha as colunas usadas pela agenda
-- ----------------------------------------------------------------------------
ALTER TABLE public.chat_reminders 
  ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL;

-- priority sem constraint para não falhar com dados existentes
ALTER TABLE public.chat_reminders 
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20);

UPDATE public.chat_reminders 
  SET priority = 'media' 
  WHERE priority IS NULL OR priority = '' OR priority NOT IN ('baixa', 'media', 'alta');

ALTER TABLE public.chat_reminders 
  DROP CONSTRAINT IF EXISTS chat_reminders_priority_check;

ALTER TABLE public.chat_reminders 
  ADD CONSTRAINT chat_reminders_priority_check 
  CHECK (priority IN ('baixa', 'media', 'alta'));

-- reminder_type sem constraint para não falhar com dados existentes
ALTER TABLE public.chat_reminders 
  ADD COLUMN IF NOT EXISTS reminder_type VARCHAR(50);

UPDATE public.chat_reminders 
  SET reminder_type = 'outro' 
  WHERE reminder_type IS NULL 
     OR reminder_type = '' 
     OR reminder_type NOT IN ('prazo_judicial', 'lembrete_cliente', 'prazo_interno', 'reuniao', 'audiencia', 'outro');

ALTER TABLE public.chat_reminders 
  DROP CONSTRAINT IF EXISTS chat_reminders_reminder_type_check;

ALTER TABLE public.chat_reminders 
  ADD CONSTRAINT chat_reminders_reminder_type_check 
  CHECK (reminder_type IN ('prazo_judicial', 'lembrete_cliente', 'prazo_interno', 'reuniao', 'audiencia', 'outro'));

-- ----------------------------------------------------------------------------
-- 2. Recriar view agenda_consolidada com alias e colunas corrigidos
-- ----------------------------------------------------------------------------
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

COMMENT ON VIEW agenda_consolidada IS 'View que consolida prazos de cases, lembretes e eventos em uma única agenda (corrigida)';

-- ----------------------------------------------------------------------------
-- 3. Recriar função get_agenda com melhoria no filtro vazio
-- ----------------------------------------------------------------------------
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
  title VARCHAR,
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
    ac.title,
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

COMMENT ON FUNCTION get_agenda IS 'Busca itens da agenda com filtros opcionais';
