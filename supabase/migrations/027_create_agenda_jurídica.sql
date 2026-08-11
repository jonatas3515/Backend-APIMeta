-- ============================================================================
-- MIGRATION: Criar módulo de Agenda Jurídica com prazos e lembretes
-- ============================================================================

-- ============================================================================
-- 1. ADICIONAR CAMPOS DE PRIORIDADE AOS REMINDERS
-- ============================================================================

ALTER TABLE chat_reminders ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'media' CHECK (priority IN ('baixa', 'media', 'alta'));
ALTER TABLE chat_reminders ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES cases(id) ON DELETE SET NULL;
ALTER TABLE chat_reminders ADD COLUMN IF NOT EXISTS reminder_type VARCHAR(50) DEFAULT 'lembrete' CHECK (reminder_type IN ('prazo_judicial', 'lembrete_cliente', 'prazo_interno', 'reuniao', 'audiencia', 'outro'));

COMMENT ON COLUMN chat_reminders.priority IS 'Prioridade do lembrete: baixa, media, alta';
COMMENT ON COLUMN chat_reminders.case_id IS 'Referência ao caso (opcional)';
COMMENT ON COLUMN chat_reminders.reminder_type IS 'Tipo de lembrete para categorização na agenda';

CREATE INDEX IF NOT EXISTS idx_chat_reminders_priority ON chat_reminders(priority);
CREATE INDEX IF NOT EXISTS idx_chat_reminders_case_id ON chat_reminders(case_id);
CREATE INDEX IF NOT EXISTS idx_chat_reminders_reminder_type ON chat_reminders(reminder_type);

-- ============================================================================
-- 2. CRIAR TABELA case_events PARA MÚLTIPLOS EVENTOS POR CASO
-- ============================================================================

CREATE TABLE IF NOT EXISTS case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_time TIME,
  event_type VARCHAR(100) NOT NULL,
  description TEXT,
  priority VARCHAR(20) DEFAULT 'media' CHECK (priority IN ('baixa', 'media', 'alta')),
  location VARCHAR(255),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE case_events IS 'Eventos/prazos específicos de um caso (audiências, prazos, reuniões)';
COMMENT ON COLUMN case_events.event_type IS 'audiencia, prazo_judicial, reuniao, prazo_administrativo, etc.';
COMMENT ON COLUMN case_events.priority IS 'Prioridade do evento: baixa, media, alta';

CREATE INDEX IF NOT EXISTS idx_case_events_case ON case_events(case_id);
CREATE INDEX IF NOT EXISTS idx_case_events_date ON case_events(event_date);
CREATE INDEX IF NOT EXISTS idx_case_events_priority ON case_events(priority);
CREATE INDEX IF NOT EXISTS idx_case_events_type ON case_events(event_type);

-- ============================================================================
-- 3. TRIGGER PARA updated_at EM case_events
-- ============================================================================

CREATE OR REPLACE FUNCTION update_case_events_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_case_events_updated_at ON case_events;
CREATE TRIGGER trigger_case_events_updated_at
BEFORE UPDATE ON case_events
FOR EACH ROW
EXECUTE FUNCTION update_case_events_timestamp();

-- ============================================================================
-- 4. VIEW PARA AGENDA CONSOLIDADA (PRAZOS + LEMBRETES)
-- ============================================================================

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
FROM cases
WHERE c.deadline_date IS NOT NULL
  AND c.status NOT IN ('encerrado', 'cancelado')

UNION ALL

SELECT 
  'reminder' as item_type,
  cr.case_id,
  cr.id as reminder_id,
  cr.conversation_id,
  cr.title as title,
  cr.scheduled_for::DATE as event_date,
  cr.scheduled_for::TIME as event_time,
  cr.reminder_type as event_type,
  cr.message as description,
  cr.priority,
  c.legal_area,
  c.case_type,
  c.municipality,
  c.agency,
  c.client_role,
  c.status,
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
  ce.description as title,
  ce.event_date,
  ce.event_time,
  ce.event_type,
  ce.description,
  ce.priority,
  c.legal_area,
  c.case_type,
  c.municipality,
  c.agency,
  c.client_role,
  c.status,
  ce.created_at
FROM case_events ce
JOIN cases c ON ce.case_id = c.id
WHERE ce.event_date >= CURRENT_DATE;

COMMENT ON VIEW agenda_consolidada IS 'View que consolida prazos de cases, lembretes e eventos em uma única agenda';

-- ============================================================================
-- 5. FUNÇÃO PARA BUSCAR AGENDA POR INTERVALO
-- ============================================================================

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
    AND (p_legal_area IS NULL OR ac.legal_area = p_legal_area)
    AND (p_municipality IS NULL OR ac.municipality = p_municipality)
    AND (p_agency IS NULL OR ac.agency = p_agency)
    AND (p_priority IS NULL OR ac.priority = p_priority)
  ORDER BY ac.event_date ASC, ac.priority DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_agenda IS 'Busca itens da agenda (prazos, lembretes, eventos) por intervalo e filtros';

-- ============================================================================
-- 6. FUNÇÃO PARA CONTAR PRAZOS POR DIA
-- ============================================================================

CREATE OR REPLACE FUNCTION count_agenda_by_day(
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_end_date DATE DEFAULT CURRENT_DATE + INTERVAL '30 days'
)
RETURNS TABLE (
  event_date DATE,
  total_items INT,
  alta_priority INT,
  media_priority INT,
  baixa_priority INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ac.event_date,
    COUNT(*)::INT as total_items,
    COUNT(CASE WHEN ac.priority = 'alta' THEN 1 END)::INT as alta_priority,
    COUNT(CASE WHEN ac.priority = 'media' THEN 1 END)::INT as media_priority,
    COUNT(CASE WHEN ac.priority = 'baixa' THEN 1 END)::INT as baixa_priority
  FROM agenda_consolidada ac
  WHERE ac.event_date BETWEEN p_start_date AND p_end_date
  GROUP BY ac.event_date
  ORDER BY ac.event_date ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION count_agenda_by_day IS 'Conta itens da agenda agrupados por dia e prioridade';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
-- Resumo:
-- ✓ Adicionado priority e reminder_type aos chat_reminders
-- ✓ Criada tabela case_events para múltiplos eventos por caso
-- ✓ View agenda_consolidada que consolida prazos, lembretes e eventos
-- ✓ Função get_agenda para buscar com filtros
-- ✓ Função count_agenda_by_day para contar itens por dia
-- ============================================================================
