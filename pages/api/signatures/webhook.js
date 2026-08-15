import { supabase } from '../../../lib/supabaseClient';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { event, data } = req.body;

    if (!event || !data) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    console.log(`[SIGNATURE-WEBHOOK] Evento recebido: ${event}`);

    // Processa diferentes eventos do Zapsign
    switch (event) {
      case 'document.signed':
        return handleDocumentSigned(data, res);
      case 'document.completed':
        return handleDocumentCompleted(data, res);
      case 'document.rejected':
        return handleDocumentRejected(data, res);
      default:
        console.log(`[SIGNATURE-WEBHOOK] Evento desconhecido: ${event}`);
        return res.status(200).json({ message: 'Evento recebido' });
    }
  } catch (error) {
    console.error('[SIGNATURE-WEBHOOK] Erro:', error);
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
    console.error('[SIGNATURE-WEBHOOK-SIGNED] Erro:', error);
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
    console.error('[SIGNATURE-WEBHOOK-COMPLETED] Erro:', error);
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
    console.error('[SIGNATURE-WEBHOOK-REJECTED] Erro:', error);
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
    console.error('[UPDATE-CASE-STAGE] Erro:', error);
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
    console.error('[NOTIFY-SIGNATURE] Erro:', error);
  }
}
