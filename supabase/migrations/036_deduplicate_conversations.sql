-- Unifica conversas duplicadas pelo mesmo número (DDD + telefone) e impede novas duplicatas
-- A conversa mais antiga (created_at) prevalece.

DO $$
DECLARE
  target_id UUID;
  phone TEXT;
BEGIN
  FOR phone IN
    SELECT client_phone
    FROM public.conversations
    WHERE client_phone IS NOT NULL
    GROUP BY client_phone
    HAVING count(*) > 1
  LOOP
    SELECT id INTO target_id
    FROM public.conversations
    WHERE client_phone = phone
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    -- Reassocia todos os registros filhos para a conversa mais antiga
    UPDATE public.messages SET conversation_id = target_id WHERE conversation_id IN (
      SELECT id FROM public.conversations WHERE client_phone = phone AND id <> target_id
    );

    UPDATE public.cases SET conversation_id = target_id WHERE conversation_id IN (
      SELECT id FROM public.conversations WHERE client_phone = phone AND id <> target_id
    );

    UPDATE public.chat_reminders SET conversation_id = target_id WHERE conversation_id IN (
      SELECT id FROM public.conversations WHERE client_phone = phone AND id <> target_id
    );

    UPDATE public.funnel_history SET conversation_id = target_id WHERE conversation_id IN (
      SELECT id FROM public.conversations WHERE client_phone = phone AND id <> target_id
    );

    UPDATE public.generated_documents SET conversation_id = target_id WHERE conversation_id IN (
      SELECT id FROM public.conversations WHERE client_phone = phone AND id <> target_id
    );

    UPDATE public.routine_executions SET conversation_id = target_id WHERE conversation_id IN (
      SELECT id FROM public.conversations WHERE client_phone = phone AND id <> target_id
    );

    UPDATE public.internal_notes SET conversation_id = target_id WHERE conversation_id IN (
      SELECT id FROM public.conversations WHERE client_phone = phone AND id <> target_id
    );

    UPDATE public.consent_logs SET conversation_id = target_id WHERE conversation_id IN (
      SELECT id FROM public.conversations WHERE client_phone = phone AND id <> target_id
    );

    UPDATE public.client_info_requests SET conversation_id = target_id WHERE conversation_id IN (
      SELECT id FROM public.conversations WHERE client_phone = phone AND id <> target_id
    );

    UPDATE public.case_insights SET conversation_id = target_id WHERE conversation_id IN (
      SELECT id FROM public.conversations WHERE client_phone = phone AND id <> target_id
    );

    UPDATE public.insight_usage SET conversation_id = target_id WHERE conversation_id IN (
      SELECT id FROM public.conversations WHERE client_phone = phone AND id <> target_id
    );

    -- Remove as conversas duplicadas, mantendo a mais antiga
    DELETE FROM public.conversations
    WHERE client_phone = phone
      AND id <> target_id;
  END LOOP;
END $$;

-- Cria índice único para evitar novas duplicatas pelo mesmo número
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_client_phone_unique
  ON public.conversations(client_phone);
