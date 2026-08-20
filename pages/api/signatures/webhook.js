import { supabase } from '../../../lib/supabaseClient';
import crypto from 'crypto';
import { sanitizeError } from '../../../lib/webhookLog';

const ZAPSIGN_WEBHOOK_SECRET = process.env.ZAPSIGN_WEBHOOK_SECRET;

function isWebhookAuthentic(req) {
  // Se não houver segredo configurado, aceita o webhook (fallback para testes)
  // Em produção, ZAPSIGN_WEBHOOK_SECRET deve ser configurado na Vercel
  if (!ZAPSIGN_WEBHOOK_SECRET) {
    console.warn('[SIGNATURE-WEBHOOK] ZAPSIGN_WEBHOOK_SECRET não configurado. Validando sem autenticação (modo não seguro).');
    return true;
  }

  // Suporta validação por header X-Zapsign-Secret ou query ?secret=
  const headerSecret = req.headers['x-zapsign-secret'];
  const querySecret = req.query?.secret;

  const providedSecret = headerSecret || querySecret;
  if (!providedSecret) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(providedSecret, 'utf8'),
      Buffer.from(ZAPSIGN_WEBHOOK_SECRET, 'utf8')
    );
  } catch (e) {
    return false;
  }
}

function getEventIdempotencyKey(event, data) {
  // Gera uma chave única para evitar duplicidade de processamento
  const uuid = data?.uuid || 'unknown';
  const eventType = event || 'unknown';
  return `${eventType}:${uuid}`;
}

async function wasWebhookProcessed(idempotencyKey) {
  const { data, error } = await supabase
    .from('signature_webhook_logs')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .limit(1);

  if (error) {
    console.error('[SIGNATURE-WEBHOOK] Erro ao verificar idempotência:', sanitizeError(error));
    return false; // Em caso de erro, permite processar (não bloqueia)
  }

  return (data || []).length > 0;
}

async function logWebhook(idempotencyKey, event, status) {
  try {
    await supabase
      .from('signature_webhook_logs')
      .insert({
        idempotency_key: idempotencyKey,
        event_type: event,
        status: status,
        created_at: new Date().toISOString()
      });
  } catch (e) {
    console.error('[SIGNATURE-WEBHOOK] Erro ao logar webhook:', sanitizeError(e));
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Valida autenticidade do webhook
  if (!isWebhookAuthentic(req)) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const { event, data } = req.body;

    if (!event || !data) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    // Só loga evento e uuid, nunca tokens, chaves ou dados sensíveis
    console.log(`[SIGNATURE-WEBHOOK] Evento recebido: ${event}, uuid: ${data?.uuid}`);

    const idempotencyKey = getEventIdempotencyKey(event, data);

    // Idempotência: verifica se já processou
    if (await wasWebhookProcessed(idempotencyKey)) {
      console.log(`[SIGNATURE-WEBHOOK] Evento já processado: ${idempotencyKey}`);
      return res.status(200).json({ message: 'Evento já processado' });
    }

    // Registra processamento iniciado
    await logWebhook(idempotencyKey, event, 'processing');

    let result;

    // Processa diferentes eventos do Zapsign
    switch (event) {
      case 'document.signed':
        result = await handleDocumentSigned(data, res);
        break;
      case 'document.completed':
        result = await handleDocumentCompleted(data, res);
        break;
      case 'document.rejected':
        result = await handleDocumentRejected(data, res);
        break;
      default:
        console.log(`[SIGNATURE-WEBHOOK] Evento desconhecido: ${event}`);
        result = res.status(200).json({ message: 'Evento recebido' });
    }

    // Marca como concluído
    await logWebhook(idempotencyKey, event, 'completed');
    return result;
  } catch (error) {
    console.error('[SIGNATURE-WEBHOOK] Erro:', sanitizeError(error));
    return res.status(500).json({ error: 'Erro ao processar webhook' });
  }
}

async function handleDocumentSigned(data, res) {
  try {
    const { uuid, signers } = data;

    // Busca documento no banco
    const { data: signature, error: selectError } = await supabase
      .from('document_signatures')
      .select('*')
      .eq('platform_document_id', uuid)
      .single();

    if (selectError || !signature) {
      console.warn(`[SIGNATURE-WEBHOOK] Documento não encontrado: ${uuid}`);
      return res.status(200).json({ message: 'Documento não encontrado' });
    }

    // Atualiza status de signatários
    const updatedSigners = signature.signers.map(signer => {
      const zapsignSigner = signers.find(z => z.email === signer.email);
      if (zapsignSigner) {
        return {
          ...signer,
          signed_at: zapsignSigner.signed_at,
          signed: true
        };
      }
      return signer;
    });

    // Verifica se todos assinaram
    const allSigned = updatedSigners.every(s => s.signed);

    // Atualiza documento
    const { error: updateError } = await supabase
      .from('document_signatures')
      .update({
        signers: updatedSigners,
        status: allSigned ? 'completed' : 'signed',
        completed_at: allSigned ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', signature.id);

    if (updateError) throw updateError;

    // Notifica usuário
    await notifySignatureUpdate(signature.case_id, 'signed', updatedSigners);

    console.log(`[SIGNATURE-WEBHOOK] Documento atualizado: ${uuid}`);
    return res.status(200).json({ message: 'Documento atualizado com sucesso' });
  } catch (error) {
    console.error('[SIGNATURE-WEBHOOK-SIGNED] Erro:', sanitizeError(error));
    return res.status(500).json({ error: 'Erro ao processar assinatura' });
  }
}

async function handleDocumentCompleted(data, res) {
  try {
    const { uuid, signed_at, download_url } = data;

    // Busca documento
    const { data: signature, error: selectError } = await supabase
      .from('document_signatures')
      .select('*')
      .eq('platform_document_id', uuid)
      .single();

    if (selectError || !signature) {
      console.warn(`[SIGNATURE-WEBHOOK] Documento não encontrado: ${uuid}`);
      return res.status(200).json({ message: 'Documento não encontrado' });
    }

    // Atualiza status para concluído
    const { error: updateError } = await supabase
      .from('document_signatures')
      .update({
        status: 'completed',
        document_url: download_url || signature.document_url,
        completed_at: signed_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', signature.id);

    if (updateError) throw updateError;

    // Atualiza etapa do caso se configurado
    await updateCaseStage(signature.case_id, signature.document_type);

    // Notifica usuário
    await notifySignatureUpdate(signature.case_id, 'completed', signature.signers);

    console.log(`[SIGNATURE-WEBHOOK] Documento concluído: ${uuid}`);
    return res.status(200).json({ message: 'Documento concluído com sucesso' });
  } catch (error) {
    console.error('[SIGNATURE-WEBHOOK-COMPLETED] Erro:', sanitizeError(error));
    return res.status(500).json({ error: 'Erro ao processar conclusão' });
  }
}

async function handleDocumentRejected(data, res) {
  try {
    const { uuid, rejected_by, rejection_reason } = data;

    // Busca documento
    const { data: signature, error: selectError } = await supabase
      .from('document_signatures')
      .select('*')
      .eq('platform_document_id', uuid)
      .single();

    if (selectError || !signature) {
      console.warn(`[SIGNATURE-WEBHOOK] Documento não encontrado: ${uuid}`);
      return res.status(200).json({ message: 'Documento não encontrado' });
    }

    // Atualiza status para rejeitado
    const { error: updateError } = await supabase
      .from('document_signatures')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString()
      })
      .eq('id', signature.id);

    if (updateError) throw updateError;

    // Notifica usuário
    await notifySignatureUpdate(signature.case_id, 'rejected', signature.signers);

    console.log(`[SIGNATURE-WEBHOOK] Documento rejeitado: ${uuid}`);
    return res.status(200).json({ message: 'Documento rejeitado registrado' });
  } catch (error) {
    console.error('[SIGNATURE-WEBHOOK-REJECTED] Erro:', sanitizeError(error));
    return res.status(500).json({ error: 'Erro ao processar rejeição' });
  }
}

async function updateCaseStage(caseId, documentType) {
  try {
    // Mapeia tipo de documento para próxima etapa
    const stageMap = {
      'proposta': 'proposta_enviada',
      'contrato': 'contrato_assinado',
      'termo_consentimento': 'intake_concluido'
    };

    const nextStage = stageMap[documentType];
    if (!nextStage) return;

    const { error } = await supabase
      .from('cases')
      .update({
        status: nextStage,
        updated_at: new Date().toISOString()
      })
      .eq('id', caseId);

    if (error) throw error;
    console.log(`[SIGNATURE-WEBHOOK] Caso atualizado para ${nextStage}`);
  } catch (error) {
    console.error('[UPDATE-CASE-STAGE] Erro:', sanitizeError(error));
  }
}

async function notifySignatureUpdate(caseId, status, signers) {
  try {
    // Busca caso e conversa
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('conversation_id')
      .eq('id', caseId)
      .single();

    if (caseError || !caseData) return;

    const conversationId = caseData.conversation_id;
    const statusMessages = {
      'signed': `✅ Documento assinado por ${signers.filter(s => s.signed).length} signatário(s)`,
      'completed': '✅ Todas as assinaturas foram concluídas com sucesso!',
      'rejected': '❌ Documento foi rejeitado por um signatário'
    };

    const message = statusMessages[status] || 'Status de assinatura atualizado';

    // Salva notificação no chat
    await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        text: message,
        sender_type: 'bot',
        direction: 'outbound',
        content_type: 'text',
        status: 'sent'
      });

    console.log(`[NOTIFY] Notificação enviada para conversa ${conversationId}`);
  } catch (error) {
    console.error('[NOTIFY-SIGNATURE] Erro:', sanitizeError(error));
  }
}
