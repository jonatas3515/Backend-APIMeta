-- Normaliza telefone para comparação, tratando o 9 à esquerda como opcional
-- no mesmo DDD. Ex: 73 99934-8552 e 73 9934-8552 são a mesma conversa.

-- Cria função de normalização
CREATE OR REPLACE FUNCTION public.normalize_phone(phone TEXT)
RETURNS TEXT AS $$
DECLARE
  digits TEXT;
BEGIN
  digits := regexp_replace(phone, '\D', '', 'g');

  -- Remove o código do país 55 quando presente (55 + DDD + local)
  IF digits LIKE '55%' AND length(digits) > 11 THEN
    digits := substring(digits from 3);
  END IF;

  -- Se tiver DDD (2 dígitos), o local começar com 9 e tiver 9 dígitos,
  -- remove o 9 inicial, pois é o dígito opcional dos celulares
  IF length(digits) = 11 AND substring(digits from 3 for 1) = '9' THEN
    digits := substring(digits from 1 for 2) || substring(digits from 4);
  END IF;

  RETURN digits;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Adiciona a coluna normalizada se ainda não existir
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS client_phone_normalized TEXT;

-- Atualiza a coluna normalizada em todas as conversas existentes
UPDATE public.conversations
  SET client_phone_normalized = public.normalize_phone(client_phone)
  WHERE client_phone IS NOT NULL;

-- Unifica conversas duplicadas após a normalização
DO $$
DECLARE
  target_id UUID;
  phone TEXT;
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'messages', 'cases', 'chat_reminders', 'funnel_history',
    'generated_documents', 'routine_executions', 'internal_notes',
    'consent_logs', 'client_info_requests', 'case_insights', 'insight_usage'
  ];
BEGIN
  FOR phone IN
    SELECT client_phone_normalized
    FROM public.conversations
    WHERE client_phone_normalized IS NOT NULL
    GROUP BY client_phone_normalized
    HAVING count(*) > 1
  LOOP
    SELECT id INTO target_id
    FROM public.conversations
    WHERE client_phone_normalized = phone
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    -- Reassocia registros filhos apenas nas tabelas que existirem
    FOREACH tbl IN ARRAY tables
    LOOP
      IF to_regclass('public.' || tbl) IS NOT NULL THEN
        EXECUTE format('UPDATE public.%I SET conversation_id = $1 WHERE conversation_id IN (SELECT id FROM public.conversations WHERE client_phone_normalized = $2 AND id <> $1)', tbl)
          USING target_id, phone;
      END IF;
    END LOOP;

    DELETE FROM public.conversations
    WHERE client_phone_normalized = phone
      AND id <> target_id;
  END LOOP;
END $$;

-- Remove o índice único antigo (exato) e cria o novo sobre o número normalizado
DROP INDEX IF EXISTS public.idx_conversations_client_phone_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_client_phone_normalized_unique
  ON public.conversations(client_phone_normalized);
