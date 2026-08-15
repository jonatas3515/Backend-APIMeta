import { supabase } from '../../../lib/supabaseClient';
import { decrypt } from '../../../lib/encryption';
import FormData from 'form-data';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const headers = req.headers;
    const token = headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    // Verifica autenticação
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const { case_id, document_type, signers, document_url } = req.body;

    if (!case_id || !document_type || !signers || !document_url) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    if (!UUID_REGEX.test(case_id)) {
      return res.status(400).json({ error: 'case_id inválido' });
    }

    // Verifica se o usuário tem acesso ao caso
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('id, conversation_id')
      .eq('id', case_id)
      .single();

    if (caseError || !caseData) {
      return res.status(404).json({ error: 'Caso não encontrado' });
    }

    // Prioridade 1: variável de ambiente ZAPSIGN_API_KEY
    let api_key = process.env.ZAPSIGN_API_KEY || null;
    let platform = 'zapsign';

    // Prioridade 2: configuração criptografada no banco (caso env não esteja definida)
    if (!api_key) {
      const { data: config, error: configError } = await supabase
        .from('signature_integration_config')
        .select('platform, api_key_encrypted')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (configError || !config) {
        return res.status(400).json({ error: 'Assinatura eletrônica não configurada' });
      }

      api_key = decrypt(config.api_key_encrypted);
      platform = config.platform;
    }

    // Envia para Zapsign
    if (platform === 'zapsign') {
      return sendToZapsign(
        api_key,
        case_id,
        document_type,
        signers,
        document_url,
        user.id,
        res
      );
    }

    return res.status(400).json({ error: 'Plataforma não suportada' });
  } catch (error) {
    console.error('[SIGNATURES-SEND] Erro:', error);
    return res.status(500).json({ error: 'Erro ao enviar documento para assinatura' });
  }
}

async function sendToZapsign(apiKey, caseId, documentType, signers, documentUrl, userId, res) {
  try {
    // Baixa o documento
    const docResponse = await fetch(documentUrl);
    if (!docResponse.ok) {
      throw new Error(`Erro ao baixar documento: ${docResponse.statusText}`);
    }

    const docBuffer = await docResponse.arrayBuffer();
    const docName = `${documentType}_${Date.now()}.pdf`;

    // Prepara dados para Zapsign
    const zapsignSigners = signers.map((signer, index) => ({
      name: signer.name,
      email: signer.email,
      phone_number: signer.phone,
      order: index + 1,
      send_via: signer.send_via || 'whatsapp' // 'whatsapp', 'email', 'both'
    }));

    // Prepara FormData para upload
    const formData = new FormData();
    formData.append('file', Buffer.from(docBuffer), docName);
    formData.append('signers', JSON.stringify(zapsignSigners));
    formData.append('name', `${documentType}_${caseId}`);

    // Envia para Zapsign
    const zapsignResponse = await fetch('https://api.zapsign.com.br/api/v1/documents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!zapsignResponse.ok) {
      const errorData = await zapsignResponse.json();
      throw new Error(`Zapsign error: ${JSON.stringify(errorData)}`);
    }

    const zapsignData = await zapsignResponse.json();
    const platformDocumentId = zapsignData.uuid;

    // Salva registro no banco
    const { data: signature, error: insertError } = await supabase
      .from('document_signatures')
      .insert({
        case_id: caseId,
        document_name: docName,
        document_url: documentUrl,
        document_type: documentType,
        status: 'pending',
        platform: 'zapsign',
        platform_document_id: platformDocumentId,
        signers: signers,
        sent_at: new Date().toISOString(),
        created_by: userId
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`[ZAPSIGN] Documento enviado: ${platformDocumentId}`);

    return res.status(200).json({
      message: 'Documento enviado para assinatura com sucesso',
      signature: {
        id: signature.id,
        platform_document_id: platformDocumentId,
        status: signature.status,
        signers: signature.signers
      }
    });
  } catch (error) {
    console.error('[ZAPSIGN-SEND] Erro:', error);
    return res.status(500).json({
      error: 'Erro ao enviar documento para Zapsign',
      details: error.message
    });
  }
}
