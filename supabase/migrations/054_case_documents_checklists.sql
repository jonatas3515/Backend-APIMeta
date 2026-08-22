-- ============================================================================
-- MIGRATION 054: Gestao de Documentos e Checklists por Caso
-- Nao altera migration 034. Preserva dados atuais. Idempotente.
-- Regra de acesso: admin e advogado acesso geral; estagiario apenas casos atribuidos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. TABELA case_documents
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.case_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  checklist_item_id UUID REFERENCES public.case_document_checklists(id) ON DELETE SET NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'chat-files',
  storage_path TEXT NOT NULL,
  origin VARCHAR(50) NOT NULL DEFAULT 'whatsapp', -- whatsapp, upload
  mime_type VARCHAR(100),
  file_size BIGINT,
  original_filename TEXT,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ,
  is_sensitive BOOLEAN NOT NULL DEFAULT false,
  review_status VARCHAR(50) CHECK (review_status IN ('pendente','em_revisao','revisado','recusado')),
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.case_documents IS 'Arquivos recebidos de clientes, vinculados a casos. Nunca armazena URL assinada.';
COMMENT ON COLUMN public.case_documents.storage_path IS 'Caminho interno no bucket; URL temporaria gerada apenas no backend autorizado';

CREATE INDEX IF NOT EXISTS idx_case_documents_case_id ON public.case_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_case_documents_conversation_id ON public.case_documents(conversation_id);
CREATE INDEX IF NOT EXISTS idx_case_documents_checklist_item_id ON public.case_documents(checklist_item_id);
CREATE INDEX IF NOT EXISTS idx_case_documents_created_at ON public.case_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_documents_review_status ON public.case_documents(review_status);

-- ----------------------------------------------------------------------------
-- B. EXPANDIR document_checklist_templates
-- ----------------------------------------------------------------------------
ALTER TABLE public.document_checklist_templates
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conditional_on JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS legal_area VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_common BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_document_checklist_templates_legal_area ON public.document_checklist_templates(legal_area);
CREATE INDEX IF NOT EXISTS idx_document_checklist_templates_is_common ON public.document_checklist_templates(is_common);
CREATE INDEX IF NOT EXISTS idx_document_checklist_templates_active_area ON public.document_checklist_templates(is_active, legal_area);

-- Verifica duplicatas e cria indice unico de forma idempotente
DO $$
DECLARE
  has_unique boolean;
  dup_count int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'document_checklist_templates'
      AND indexdef ILIKE '%UNIQUE%(case_type, document_name)%'
  ) INTO has_unique;

  IF NOT has_unique THEN
    SELECT COUNT(*) INTO dup_count
    FROM (
      SELECT 1 FROM public.document_checklist_templates
      GROUP BY case_type, document_name
      HAVING COUNT(*) > 1
    ) d;

    IF dup_count > 0 THEN
      RAISE EXCEPTION 'Duplicatas encontradas em document_checklist_templates(case_type, document_name). Corrija manualmente antes de prosseguir.';
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_templates_unique_case_doc
      ON public.document_checklist_templates(case_type, document_name);
  END IF;
END $$;

-- title passa a ser a fonte principal; copiar document_name antigo se vazio
UPDATE public.document_checklist_templates
SET title = COALESCE(title, document_name)
WHERE title IS NULL;

-- ----------------------------------------------------------------------------
-- C. EXPANDIR case_document_checklists
-- ----------------------------------------------------------------------------
ALTER TABLE public.case_document_checklists
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.document_checklist_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS observacao TEXT,
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispensed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispensed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispense_reason TEXT;

ALTER TABLE public.case_document_checklists
  DROP COLUMN IF EXISTS document_id;

CREATE INDEX IF NOT EXISTS idx_case_document_checklists_template_id ON public.case_document_checklists(template_id);
CREATE INDEX IF NOT EXISTS idx_case_document_checklists_requested_at ON public.case_document_checklists(requested_at);
CREATE INDEX IF NOT EXISTS idx_case_document_checklists_title ON public.case_document_checklists(title);

-- copiar nome para titulo
UPDATE public.case_document_checklists
SET title = COALESCE(title, document_name)
WHERE title IS NULL;

-- ----------------------------------------------------------------------------
-- D. MIGRAR STATUS LEGADO
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.case_document_checklists'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.case_document_checklists DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

UPDATE public.case_document_checklists
SET status = CASE status
  WHEN 'pending' THEN 'pendente'
  WHEN 'sent' THEN 'solicitado'
  WHEN 'received' THEN 'recebido'
  WHEN 'verified' THEN 'revisado'
  ELSE status
END;

ALTER TABLE public.case_document_checklists
  ADD CONSTRAINT case_document_checklists_status_check
    CHECK (status IN ('pendente','solicitado','recebido','em_revisao','revisado','recusado','dispensado'));

-- ----------------------------------------------------------------------------
-- E. NOVAS TABELAS DE FLUXO
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_checklist_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  items JSONB NOT NULL DEFAULT '[]',
  wa_message_id VARCHAR(255),
  message_template_key VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','resent')),
  batch_number INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.document_checklist_requests IS 'Historico de solicitacoes de documentos ao cliente via WhatsApp';

CREATE INDEX IF NOT EXISTS idx_doc_requests_case_id ON public.document_checklist_requests(case_id);
CREATE INDEX IF NOT EXISTS idx_doc_requests_status ON public.document_checklist_requests(status);
CREATE INDEX IF NOT EXISTS idx_doc_requests_requested_at ON public.document_checklist_requests(requested_at);

CREATE TABLE IF NOT EXISTS public.document_review_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_document_checklist_id UUID NOT NULL REFERENCES public.case_document_checklists(id) ON DELETE CASCADE,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ DEFAULT NOW(),
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.document_review_logs IS 'Auditoria de mudancas de status de revisao de itens do checklist';

CREATE INDEX IF NOT EXISTS idx_review_logs_checklist_id ON public.document_review_logs(case_document_checklist_id);
CREATE INDEX IF NOT EXISTS idx_review_logs_reviewed_at ON public.document_review_logs(reviewed_at);

-- ----------------------------------------------------------------------------
-- F. TRIGGERS updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_case_documents_updated_at ON public.case_documents;
CREATE TRIGGER trigger_update_case_documents_updated_at
  BEFORE UPDATE ON public.case_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_doc_checklist_requests_updated_at ON public.document_checklist_requests;
CREATE TRIGGER trigger_update_doc_checklist_requests_updated_at
  BEFORE UPDATE ON public.document_checklist_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- G. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.case_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_checklist_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_review_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_document_checklists ENABLE ROW LEVEL SECURITY;

-- service role bypass em todas
DROP POLICY IF EXISTS service_role_bypass_case_documents ON public.case_documents;
CREATE POLICY service_role_bypass_case_documents ON public.case_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_bypass_doc_requests ON public.document_checklist_requests;
CREATE POLICY service_role_bypass_doc_requests ON public.document_checklist_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_bypass_review_logs ON public.document_review_logs;
CREATE POLICY service_role_bypass_review_logs ON public.document_review_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_bypass_doc_templates ON public.document_checklist_templates;
CREATE POLICY service_role_bypass_doc_templates ON public.document_checklist_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_bypass_case_checklists ON public.case_document_checklists;
CREATE POLICY service_role_bypass_case_checklists ON public.case_document_checklists
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Regra geral: admin e advogado acesso irrestrito a documentos dos casos
-- Estagiario: somente casos atribuidos e itens/arquivos nao sensiveis

DROP POLICY IF EXISTS case_documents_admin_advogado ON public.case_documents;
CREATE POLICY case_documents_admin_advogado ON public.case_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','advogado')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','advogado')
    )
  );

DROP POLICY IF EXISTS case_documents_estagiario_select ON public.case_documents;
CREATE POLICY case_documents_estagiario_select ON public.case_documents
  FOR SELECT TO authenticated
  USING (
    case_documents.is_sensitive = false
    AND EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.cases c ON c.id = case_documents.case_id
      WHERE u.auth_user_id = auth.uid()
        AND u.role = 'estagiario'
        AND u.id = c.assigned_user_id
    )
  );

DROP POLICY IF EXISTS doc_requests_admin_advogado ON public.document_checklist_requests;
CREATE POLICY doc_requests_admin_advogado ON public.document_checklist_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','advogado')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','advogado')
    )
  );

DROP POLICY IF EXISTS review_logs_admin_advogado ON public.document_review_logs;
CREATE POLICY review_logs_admin_advogado ON public.document_review_logs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','advogado')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','advogado')
    )
  );

DROP POLICY IF EXISTS doc_templates_select ON public.document_checklist_templates;
CREATE POLICY doc_templates_select ON public.document_checklist_templates
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS doc_templates_admin_advogado_modify ON public.document_checklist_templates;
CREATE POLICY doc_templates_admin_advogado_modify ON public.document_checklist_templates
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','advogado'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','advogado'))
  );

DROP POLICY IF EXISTS case_checklists_admin_advogado ON public.case_document_checklists;
CREATE POLICY case_checklists_admin_advogado ON public.case_document_checklists
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','advogado')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','advogado')
    )
  );

DROP POLICY IF EXISTS case_checklists_estagiario_select ON public.case_document_checklists;
CREATE POLICY case_checklists_estagiario_select ON public.case_document_checklists
  FOR SELECT TO authenticated
  USING (
    case_document_checklists.is_sensitive = false
    AND EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.cases c ON c.id = case_document_checklists.case_id
      WHERE u.auth_user_id = auth.uid()
        AND u.role = 'estagiario'
        AND u.id = c.assigned_user_id
    )
  );

DROP POLICY IF EXISTS case_checklists_estagiario_update ON public.case_document_checklists;
CREATE POLICY case_checklists_estagiario_update ON public.case_document_checklists
  FOR UPDATE TO authenticated
  USING (
    case_document_checklists.is_sensitive = false
    AND EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.cases c ON c.id = case_document_checklists.case_id
      WHERE u.auth_user_id = auth.uid()
        AND u.role = 'estagiario'
        AND u.id = c.assigned_user_id
    )
  )
  WITH CHECK (
    case_document_checklists.is_sensitive = false
    AND status IN ('recebido', 'em_revisao')
    AND EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.cases c ON c.id = case_document_checklists.case_id
      WHERE u.auth_user_id = auth.uid()
        AND u.role = 'estagiario'
        AND u.id = c.assigned_user_id
    )
  );

-- ----------------------------------------------------------------------------
-- H. SEED: CHECKLIST COMUM
-- ----------------------------------------------------------------------------
INSERT INTO public.document_checklist_templates
  (case_type, document_name, title, description, category, is_required, is_sensitive, sort_order, is_active, version, legal_area, is_common, created_at, updated_at)
VALUES
  ('geral', 'Documento de identificacao com foto', 'Documento de identificacao com foto', 'Envie uma foto legivel do seu RG, CNH ou outro documento oficial com foto.', 'identificacao', true, true, 1, true, 1, NULL, true, NOW(), NOW()),
  ('geral', 'CPF', 'CPF', 'Envie uma foto ou PDF do seu CPF (pode constar no RG).', 'identificacao', true, true, 2, true, 1, NULL, true, NOW(), NOW()),
  ('geral', 'Comprovante de residencia', 'Comprovante de residencia', 'Conta de luz, agua ou outro documento em seu nome, preferencialmente dos ultimos 3 meses.', 'identificacao', true, true, 3, true, 1, NULL, true, NOW(), NOW()),
  ('geral', 'Relato cronologico dos fatos', 'Relato cronologico dos fatos', 'Descreva os acontecimentos em ordem de tempo, com datas aproximadas.', 'provas', false, false, 4, true, 1, NULL, true, NOW(), NOW()),
  ('geral', 'Documentos/provas ja disponiveis', 'Documentos/provas ja disponiveis', 'Envie quaisquer documentos, fotos, prints, contratos ou comprovantes que ja tenha em maos.', 'provas', true, false, 5, true, 1, NULL, true, NOW(), NOW()),
  ('geral', 'Urgencia, audiencia ou prazo conhecido', 'Urgencia, audiencia, prazo ou intimacao conhecida', 'Informe se ha prazo, audiencia, intimacao ou situacao urgente e, se possivel, a data.', 'andamento', false, false, 6, true, 1, NULL, true, NOW(), NOW()),
  ('geral', 'Procuracao', 'Procuracao', 'Procuracao assinada para o escritorio atuar, quando ja houver.', 'representacao', false, true, 7, true, 1, NULL, true, NOW(), NOW()),
  ('geral', 'Contrato de honorarios', 'Contrato de honorarios', 'Contrato de prestacao de servicos advocaticios, quando aplicavel.', 'representacao', false, true, 8, true, 1, NULL, true, NOW(), NOW())
ON CONFLICT (case_type, document_name) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  is_required = EXCLUDED.is_required,
  is_sensitive = EXCLUDED.is_sensitive,
  sort_order = EXCLUDED.sort_order,
  is_common = EXCLUDED.is_common,
  updated_at = NOW();

-- ----------------------------------------------------------------------------
-- I. SEED: AREAS ESPECIFICAS
-- ----------------------------------------------------------------------------
INSERT INTO public.document_checklist_templates
  (case_type, document_name, title, description, category, is_required, is_sensitive, sort_order, is_active, version, legal_area, is_common, created_at, updated_at)
VALUES
  ('defeito de produto', 'Contrato, pedido ou oferta', 'Contrato, pedido ou oferta', 'Contrato, pedido, proposta ou documento que mostre o que foi comprado/contratado.', 'consumidor', true, false, 1, true, 1, 'consumerista', false, NOW(), NOW()),
  ('defeito de produto', 'Nota fiscal, recibo ou comprovante de pagamento', 'Nota fiscal, recibo ou comprovante de pagamento', 'Comprovante do pagamento realizado.', 'consumidor', true, false, 2, true, 1, 'consumerista', false, NOW(), NOW()),
  ('defeito de produto', 'Faturas, extratos ou boletos', 'Faturas, extratos ou boletos', 'Caso haja parcelamento, faturas ou cobrancas posteriores.', 'consumidor', false, false, 3, true, 1, 'consumerista', false, NOW(), NOW()),
  ('defeito de produto', 'Protocolos de atendimento', 'Protocolos de atendimento', 'Protocolos, reclamacoes ou atendimentos feitos junto a empresa.', 'consumidor', false, false, 4, true, 1, 'consumerista', false, NOW(), NOW()),
  ('defeito de produto', 'Conversas, e-mails e prints', 'Conversas, e-mails e prints relevantes', 'Prints de conversa, e-mails, mensagens ou anuncios sobre o caso.', 'provas', false, false, 5, true, 1, 'consumerista', false, NOW(), NOW()),
  ('defeito de produto', 'Comprovante de tentativa de solucao administrativa', 'Comprovante de tentativa de solucao administrativa', 'Reclamacao no PROCON, SAC, Defesa do Consumidor ou outra tentativa.', 'provas', false, false, 6, true, 1, 'consumerista', false, NOW(), NOW()),

  ('demissao sem justa causa', 'CTPS fisica/digital', 'CTPS fisica ou digital', 'Carteira de Trabalho Digital ou foto da CTPS fisica, se tiver.', 'trabalho', false, false, 1, true, 1, 'trabalhista', false, NOW(), NOW()),
  ('demissao sem justa causa', 'Contrato de trabalho', 'Contrato de trabalho', 'Contrato individual de trabalho, se houver.', 'trabalho', false, false, 2, true, 1, 'trabalhista', false, NOW(), NOW()),
  ('demissao sem justa causa', 'Contracheques', 'Contracheques', 'Ultimos contracheques e holerites, quando disponiveis.', 'trabalho', false, false, 3, true, 1, 'trabalhista', false, NOW(), NOW()),
  ('demissao sem justa causa', 'Extrato FGTS', 'Extrato FGTS', 'Extrato do FGTS (pode ser da Caixa ou do app).', 'trabalho', false, false, 4, true, 1, 'trabalhista', false, NOW(), NOW()),
  ('demissao sem justa causa', 'Termo de rescisao', 'Termo de rescisao', 'TRCT, assinado ou nao, se houver.', 'trabalho', false, false, 5, true, 1, 'trabalhista', false, NOW(), NOW()),
  ('demissao sem justa causa', 'Aviso-previo', 'Aviso-previo', 'Documento que mostre se houve aviso previo trabalhado/indenizado.', 'trabalho', false, false, 6, true, 1, 'trabalhista', false, NOW(), NOW()),
  ('demissao sem justa causa', 'Registros de jornada', 'Registros de jornada', 'Cartoes de ponto, escalas, anotacoes de horarios extras ou mensagens sobre jornada.', 'provas', false, false, 7, true, 1, 'trabalhista', false, NOW(), NOW()),
  ('demissao sem justa causa', 'Testemunhas (informacao interna)', 'Testemunhas (informacao interna)', 'Nomes e contatos de testemunhas. Sera visivel apenas internamente.', 'provas', false, true, 8, true, 1, 'trabalhista', false, NOW(), NOW()),

  ('aposentadoria por idade', 'CNIS', 'CNIS (carteira de vinculos)', 'Extrato do CNIS com tempo de contribuicao.', 'previdencia', false, false, 1, true, 1, 'previdenciario', false, NOW(), NOW()),
  ('aposentadoria por idade', 'CTPS', 'CTPS', 'Carteira de trabalho para comprovar vinculos.', 'previdencia', false, false, 2, true, 1, 'previdenciario', false, NOW(), NOW()),
  ('aposentadoria por idade', 'Carnes/comprovantes de contribuicao', 'Carnes ou comprovantes de contribuicao', 'Carnes antigos ou recibos de contribuicao, se houver.', 'previdencia', false, false, 3, true, 1, 'previdenciario', false, NOW(), NOW()),
  ('aposentadoria por idade', 'Carta de indeferimento', 'Carta de indeferimento ou decisao administrativa', 'Documento que mostre a negativa administrativa, se houver.', 'previdencia', false, false, 4, true, 1, 'previdenciario', false, NOW(), NOW()),
  ('aposentadoria por idade', 'Numero do beneficio/requerimento', 'Numero do beneficio ou requerimento', 'Numero do processo ou requerimento administrativo, se souber.', 'andamento', false, false, 5, true, 1, 'previdenciario', false, NOW(), NOW()),
  ('aposentadoria por idade', 'Laudos e relatorios medicos', 'Laudos, relatorios medicos, receitas e exames', 'Documentos de saude pertinentes ao beneficio.', 'provas', false, true, 6, true, 1, 'previdenciario', false, NOW(), NOW()),

  ('indenizacao por dano material / moral', 'Contrato ou documento da relacao', 'Contrato, proposta, recibo ou documento da relacao juridica', 'Documento que mostre a relacao entre as partes.', 'provas', true, false, 1, true, 1, 'civel', false, NOW(), NOW()),
  ('indenizacao por dano material / moral', 'Comprovantes de pagamento', 'Comprovantes de pagamento', 'Recibos, transferencias, boletos ou outro comprovante.', 'provas', false, false, 2, true, 1, 'civel', false, NOW(), NOW()),
  ('indenizacao por dano material / moral', 'Notificacoes e comunicacoes', 'Notificacoes, conversas e e-mails', 'Mensagens trocadas com a parte contraria sobre o caso.', 'provas', false, false, 3, true, 1, 'civel', false, NOW(), NOW()),
  ('indenizacao por dano material / moral', 'Provas do dano', 'Provas do dano', 'Fotos, orcamentos, laudos ou documentos que demonstrem o dano.', 'provas', false, false, 4, true, 1, 'civel', false, NOW(), NOW()),
  ('indenizacao por dano material / moral', 'Dados da parte contraria', 'Identificacao e dados conhecidos da parte contraria', 'Nome, telefone, CNPJ ou qualquer dado da outra parte.', 'provas', false, true, 5, true, 1, 'civel', false, NOW(), NOW()),
  ('indenizacao por dano material / moral', 'Protocolo de tentativa extrajudicial', 'Protocolo de tentativa de solucao extrajudicial', 'Comprovante de tentativa de acordo/administrativa, se houver.', 'provas', false, false, 6, true, 1, 'civel', false, NOW(), NOW()),

  ('divorcio', 'Certidao de casamento ou uniao estavel', 'Certidao de casamento ou uniao estavel', 'Certidao integral e atualizada, se aplicavel.', 'familia', false, true, 1, true, 1, 'familia', false, NOW(), NOW()),
  ('divorcio', 'Certidoes de nascimento dos filhos', 'Certidoes de nascimento dos filhos', 'Certidoes dos filhos, se houver.', 'familia', false, true, 2, true, 1, 'familia', false, NOW(), NOW()),
  ('divorcio', 'Comprovantes de renda', 'Comprovantes de renda', 'Contracheques, declaracao de IR ou comprovantes de renda das partes.', 'familia', false, true, 3, true, 1, 'familia', false, NOW(), NOW()),
  ('divorcio', 'Despesas dos filhos/familia', 'Comprovantes de despesas dos filhos/familia', 'Comprovantes de escola, saude, moradia e outras despesas.', 'familia', false, true, 4, true, 1, 'familia', false, NOW(), NOW()),
  ('divorcio', 'Relacao de bens, dividas ou patrimonio', 'Relacao de bens, dividas, patrimonio ou documentos bancarios', 'Lista de bens e dividas; documentos bancarios somente se solicitado.', 'familia', false, true, 5, true, 1, 'familia', false, NOW(), NOW())
ON CONFLICT (case_type, document_name) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  is_required = EXCLUDED.is_required,
  is_sensitive = EXCLUDED.is_sensitive,
  sort_order = EXCLUDED.sort_order,
  legal_area = EXCLUDED.legal_area,
  is_common = EXCLUDED.is_common,
  updated_at = NOW();

SELECT 'Migration 054 aplicada com sucesso' AS status;
