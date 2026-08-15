// ============================================================================
// API de Teste - Simulação de Webhook Zapsign
// ============================================================================
// Uso: POST /api/signatures/test-webhook
// Body: { event: 'document.signed'|'document.completed'|'document.rejected', 
//         signature_id: 'uuid', 
//         platform_document_id: 'doc-uuid' }
//
// Permite testar o fluxo de webhook sem precisar de conta Zapsign real.
// Apenas para ambiente de desenvolvimento/teste.
// ============================================================================

import { supabase } from '../../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Verifica autenticação
  const headers = req.headers;
  const token = headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Restrição: apenas admins podem simular webhooks
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem simular webhooks' });
    }

    const { event, signature_id, platform_document_id } = req.body;

    if (!event || !signature_id) {
      return res.status(400).json({ error: 'Event e signature_id são obrigatórios' });
    }

    // Busca o document_signature
    const { data: signature, error: findError } = await supabase
      .from('document_signatures')
      .select('id, case_id, document_name, platform_document_id, signers')
      .eq('id', signature_id)
      .single();

    if (findError || !signature) {
      return res.status(404).json({ error: 'Documento de assinatura não encontrado' });
    }

    // Verifica se usuário tem acesso ao caso associado
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('id')
      .eq('id', signature.case_id)
      .single();

    if (caseError || !caseData) {
      return res.status(403).json({ error: 'Sem acesso ao caso associado' });
    }

    // Simula payload do Zapsign
    // Formato esperado pelo webhook: { event, data }
    const docUuid = platform_document_id || signature.platform_document_id || 'test-doc-uuid';
    const payload = {
      event,
      data: {
        uuid: docUuid,
        name: signature.document_name,
        status: event === 'document.completed' ? 'completed' : event === 'document.signed' ? 'signed' : 'rejected',
        signers: signature.signers?.map((signer, index) => ({
          ...signer,
          signed: event !== 'document.rejected',
          signed_at: event !== 'document.rejected' ? new Date().toISOString() : null
        })) || [],
        signed_at: event === 'document.completed' ? new Date().toISOString() : null,
        download_url: 'https://example.com/signed-document.pdf'
      }
    };

    // Chama o webhook internamente com o segredo (se configurado)
    const webhookHeaders = {
      'Content-Type': 'application/json'
    };
    if (process.env.ZAPSIGN_WEBHOOK_SECRET) {
      webhookHeaders['X-Zapsign-Secret'] = process.env.ZAPSIGN_WEBHOOK_SECRET;
    }

    const webhookRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/signatures/webhook`, {
      method: 'POST',
      headers: webhookHeaders,
      body: JSON.stringify(payload)
    });

    if (!webhookRes.ok) {
      const errorData = await webhookRes.json();
      return res.status(500).json({ 
        error: 'Webhook retornou erro', 
        details: errorData 
      });
    }

    const responseData = await webhookRes.json();

    return res.status(200).json({
      success: true,
      message: 'Evento simulado com sucesso',
      webhook_response: responseData
    });

  } catch (error) {
    console.error('[SIGNATURE-TEST-WEBHOOK] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}
