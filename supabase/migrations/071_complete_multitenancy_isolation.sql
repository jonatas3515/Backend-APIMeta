-- Migration 071: Complete Multi-Tenancy Isolation
-- Applies strict tenant office_id to chat_reminders, case_events, fee tables, document_signatures,
-- offices, users, agenda_consolidada view and get_agenda function.

-- 1. Add office_id to chat_reminders, case_events, fee tables, document_signatures
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_reminders' AND column_name = 'office_id') THEN
    ALTER TABLE chat_reminders ADD COLUMN office_id UUID REFERENCES offices(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'case_events' AND column_name = 'office_id') THEN
    ALTER TABLE case_events ADD COLUMN office_id UUID REFERENCES offices(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fee_service_catalog' AND column_name = 'office_id') THEN
    ALTER TABLE fee_service_catalog ADD COLUMN office_id UUID REFERENCES offices(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fee_simulations' AND column_name = 'office_id') THEN
    ALTER TABLE fee_simulations ADD COLUMN office_id UUID REFERENCES offices(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fee_uploaded_tables' AND column_name = 'office_id') THEN
    ALTER TABLE fee_uploaded_tables ADD COLUMN office_id UUID REFERENCES offices(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fee_adjustment_rules' AND column_name = 'office_id') THEN
    ALTER TABLE fee_adjustment_rules ADD COLUMN office_id UUID REFERENCES offices(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_signatures' AND column_name = 'office_id') THEN
    ALTER TABLE document_signatures ADD COLUMN office_id UUID REFERENCES offices(id);
  END IF;
END $$;

-- 2. Backfill existing records to Neves & Costa matriz
UPDATE chat_reminders cr
SET office_id = COALESCE(c.office_id, '00000000-0000-0000-0000-000000000001'::uuid)
FROM conversations c
WHERE cr.conversation_id = c.id AND cr.office_id IS NULL;

UPDATE chat_reminders SET office_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE office_id IS NULL;

UPDATE case_events ce
SET office_id = COALESCE(c.office_id, '00000000-0000-0000-0000-000000000001'::uuid)
FROM cases c
WHERE ce.case_id = c.id AND ce.office_id IS NULL;

UPDATE case_events SET office_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE office_id IS NULL;

UPDATE fee_service_catalog SET office_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE office_id IS NULL;

UPDATE fee_simulations fs
SET office_id = COALESCE(c.office_id, '00000000-0000-0000-0000-000000000001'::uuid)
FROM cases c
WHERE fs.case_id = c.id AND fs.office_id IS NULL;

UPDATE fee_simulations SET office_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE office_id IS NULL;

UPDATE fee_uploaded_tables SET office_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE office_id IS NULL;

UPDATE fee_adjustment_rules SET office_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE office_id IS NULL;

UPDATE document_signatures SET office_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE office_id IS NULL;

-- 3. Offices table RLS
ALTER TABLE offices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offices_isolation_policy ON offices;
CREATE POLICY offices_isolation_policy ON offices
  FOR ALL TO authenticated
  USING (id = current_user_office_id() OR current_user_is_master() = true)
  WITH CHECK (id = current_user_office_id() OR current_user_is_master() = true);

DROP POLICY IF EXISTS offices_service_role ON offices;
CREATE POLICY offices_service_role ON offices
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Users table RLS
DROP POLICY IF EXISTS users_select_authenticated ON users;
DROP POLICY IF EXISTS users_isolation_select ON users;
CREATE POLICY users_isolation_select ON users
  FOR SELECT TO authenticated
  USING (office_id = current_user_office_id() OR current_user_is_master() = true OR auth_user_id = auth.uid());

DROP POLICY IF EXISTS users_isolation_modify ON users;
CREATE POLICY users_isolation_modify ON users
  FOR ALL TO authenticated
  USING (office_id = current_user_office_id() OR current_user_is_master() = true)
  WITH CHECK (office_id = current_user_office_id() OR current_user_is_master() = true);

-- 5. Chat Reminders RLS
ALTER TABLE chat_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON chat_reminders;
DROP POLICY IF EXISTS chat_reminders_isolation_policy ON chat_reminders;
CREATE POLICY chat_reminders_isolation_policy ON chat_reminders
  FOR ALL TO authenticated
  USING (office_id = current_user_office_id() OR current_user_is_master() = true)
  WITH CHECK (office_id = current_user_office_id() OR current_user_is_master() = true);

-- 6. Case Events RLS
ALTER TABLE case_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS case_events_isolation_policy ON case_events;
CREATE POLICY case_events_isolation_policy ON case_events
  FOR ALL TO authenticated
  USING (office_id = current_user_office_id() OR current_user_is_master() = true)
  WITH CHECK (office_id = current_user_office_id() OR current_user_is_master() = true);

-- 7. Fee Tables RLS
ALTER TABLE fee_service_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fee_service_catalog_select_all ON fee_service_catalog;
DROP POLICY IF EXISTS fee_service_catalog_admin_modify ON fee_service_catalog;
DROP POLICY IF EXISTS fee_service_catalog_isolation ON fee_service_catalog;
CREATE POLICY fee_service_catalog_isolation ON fee_service_catalog
  FOR ALL TO authenticated
  USING (office_id = current_user_office_id() OR office_id IS NULL OR current_user_is_master() = true)
  WITH CHECK (office_id = current_user_office_id() OR current_user_is_master() = true);

ALTER TABLE fee_simulations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fee_simulations_select ON fee_simulations;
DROP POLICY IF EXISTS fee_simulations_modify ON fee_simulations;
DROP POLICY IF EXISTS fee_simulations_isolation ON fee_simulations;
CREATE POLICY fee_simulations_isolation ON fee_simulations
  FOR ALL TO authenticated
  USING (office_id = current_user_office_id() OR current_user_is_master() = true)
  WITH CHECK (office_id = current_user_office_id() OR current_user_is_master() = true);

ALTER TABLE fee_uploaded_tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fee_uploaded_tables_select_all ON fee_uploaded_tables;
DROP POLICY IF EXISTS fee_uploaded_tables_admin_modify ON fee_uploaded_tables;
DROP POLICY IF EXISTS fee_uploaded_tables_isolation ON fee_uploaded_tables;
CREATE POLICY fee_uploaded_tables_isolation ON fee_uploaded_tables
  FOR ALL TO authenticated
  USING (office_id = current_user_office_id() OR office_id IS NULL OR current_user_is_master() = true)
  WITH CHECK (office_id = current_user_office_id() OR current_user_is_master() = true);

ALTER TABLE fee_adjustment_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fee_adjustment_rules_isolation ON fee_adjustment_rules;
CREATE POLICY fee_adjustment_rules_isolation ON fee_adjustment_rules
  FOR ALL TO authenticated
  USING (office_id = current_user_office_id() OR office_id IS NULL OR current_user_is_master() = true)
  WITH CHECK (office_id = current_user_office_id() OR current_user_is_master() = true);

-- 8. Document Signatures RLS
ALTER TABLE document_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_signatures_isolation ON document_signatures;
CREATE POLICY document_signatures_isolation ON document_signatures
  FOR ALL TO authenticated
  USING (office_id = current_user_office_id() OR current_user_is_master() = true)
  WITH CHECK (office_id = current_user_office_id() OR current_user_is_master() = true);

-- 9. Recreate agenda_consolidada view to include office_id
DROP VIEW IF EXISTS agenda_consolidada CASCADE;
CREATE VIEW agenda_consolidada AS
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
  c.created_at,
  c.office_id
FROM cases c
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
  cr.created_at,
  COALESCE(cr.office_id, c.office_id) as office_id
FROM chat_reminders cr
LEFT JOIN conversations c ON cr.conversation_id = c.id
WHERE cr.status = 'pending'
  AND cr.scheduled_for::DATE >= CURRENT_DATE

UNION ALL

SELECT 
  'case_event' as item_type,
  ce.case_id,
  NULL::UUID as reminder_id,
  c.conversation_id,
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
  ce.created_at,
  COALESCE(ce.office_id, c.office_id) as office_id
FROM case_events ce
JOIN cases c ON ce.case_id = c.id
WHERE ce.event_date >= CURRENT_DATE;

-- 10. Recreate get_agenda function with p_office_id filter
CREATE OR REPLACE FUNCTION get_agenda(
  p_start_date DATE,
  p_end_date DATE,
  p_legal_area TEXT DEFAULT NULL,
  p_municipality TEXT DEFAULT NULL,
  p_agency TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT NULL,
  p_office_id UUID DEFAULT NULL
)
RETURNS TABLE (
  item_type TEXT,
  case_id UUID,
  reminder_id UUID,
  conversation_id UUID,
  title TEXT,
  event_date DATE,
  event_time TIME,
  event_type TEXT,
  description TEXT,
  priority TEXT,
  legal_area TEXT,
  case_type TEXT,
  municipality TEXT,
  agency TEXT,
  client_role TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  office_id UUID
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
    ac.description,
    ac.priority,
    ac.legal_area,
    ac.case_type,
    ac.municipality,
    ac.agency,
    ac.client_role,
    ac.status,
    ac.created_at,
    ac.office_id
  FROM agenda_consolidada ac
  WHERE ac.event_date >= p_start_date
    AND ac.event_date <= p_end_date
    AND (p_legal_area IS NULL OR LOWER(ac.legal_area) = LOWER(p_legal_area))
    AND (p_municipality IS NULL OR LOWER(ac.municipality) = LOWER(p_municipality))
    AND (p_agency IS NULL OR LOWER(ac.agency) = LOWER(p_agency))
    AND (p_priority IS NULL OR LOWER(ac.priority) = LOWER(p_priority))
    AND (p_office_id IS NULL OR ac.office_id = p_office_id)
  ORDER BY ac.event_date ASC, ac.event_time ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
