import { supabaseAdmin } from '../../../lib/auth';
import { encrypt, decrypt } from '../../../lib/encryption';

export default async function handler(req, res) {
  try {
    const headers = req.headers;
    const token = headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    // Verifica autenticação
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Verifica se é admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem configurar assinatura' });
    }

    const userId = profile.id;

    if (req.method === 'GET') {
      return handleGet(userId, res);
    } else if (req.method === 'PATCH') {
      return handlePatch(userId, req.body, res);
    } else if (req.method === 'POST') {
      return handlePost(userId, req.body, res);
    } else {
      return res.status(405).json({ error: 'Método não permitido' });
    }
  } catch (error) {
    console.error('[SIGNATURES-CONFIG] Erro:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

async function handleGet(userId, res) {
  try {
    const { data, error } = await supabaseAdmin
      .from('signature_integration_config')
      .select('id, platform, is_active, tested_at, test_status, test_error')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      integrations: data || [],
      message: 'Configurações carregadas com sucesso'
    });
  } catch (error) {
    console.error('[SIGNATURES-CONFIG-GET] Erro:', error);
    return res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
}

async function handlePatch(userId, body, res) {
  try {
    const { platform, api_key, api_secret } = body;

    if (!platform || !api_key) {
      return res.status(400).json({ error: 'Platform e API Key são obrigatórios' });
    }

    // Criptografa as credenciais
    const api_key_encrypted = encrypt(api_key);
    const api_secret_encrypted = api_secret ? encrypt(api_secret) : null;

    // Atualiza ou insere configuração
    const { data, error } = await supabaseAdmin
      .from('signature_integration_config')
      .upsert({
        user_id: userId,
        platform,
        api_key_encrypted,
        api_secret_encrypted,
        is_active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform'
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      message: 'Configuração salva com sucesso',
      config: {
        id: data.id,
        platform: data.platform,
        is_active: data.is_active
      }
    });
  } catch (error) {
    console.error('[SIGNATURES-CONFIG-PATCH] Erro:', error);
    return res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
}

async function handlePost(userId, body, res) {
  try {
    const { platform } = body;

    if (!platform) {
      return res.status(400).json({ error: 'Platform é obrigatório' });
    }

    // Busca configuração
    const { data: config, error: configError } = await supabaseAdmin
      .from('signature_integration_config')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();

    if (configError || !config) {
      return res.status(404).json({ error: 'Configuração não encontrada' });
    }

    // Descriptografa API Key
    const api_key = decrypt(config.api_key_encrypted);

    // Testa conexão com Zapsign
    if (platform === 'zapsign') {
      return testZapsignConnection(api_key, config.id, res);
    }

    return res.status(400).json({ error: 'Plataforma não suportada' });
  } catch (error) {
    console.error('[SIGNATURES-CONFIG-POST] Erro:', error);
    return res.status(500).json({ error: 'Erro ao testar conexão' });
  }
}

async function testZapsignConnection(apiKey, configId, res) {
  try {
    // Endpoint de listagem de documentos: mais estável para validar o token.
    const response = await fetch('https://api.zapsign.com.br/api/v1/docs/?page=1', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const isSuccess = response.ok;
    const testStatus = isSuccess ? 'success' : 'failed';
    const testError = isSuccess
      ? null
      : (response.status === 401 || response.status === 403)
        ? 'Chave inválida ou sem permissão. Verifique se a chave é de produção (api.zapsign.com.br).'
        : `HTTP ${response.status}`;

    // Atualiza status do teste
    const { error: updateError } = await supabaseAdmin
      .from('signature_integration_config')
      .update({
        tested_at: new Date().toISOString(),
        test_status: testStatus,
        test_error: testError
      })
      .eq('id', configId);

    if (updateError) throw updateError;

    if (isSuccess) {
      return res.status(200).json({
        message: 'Conexão com Zapsign estabelecida com sucesso',
        status: 'success'
      });
    }

    return res.status(200).json({
      message: 'Falha ao conectar com Zapsign',
      status: 'failed',
      error: testError
    });
  } catch (error) {
    console.error('[TEST-ZAPSIGN] Erro:', error);
    return res.status(500).json({
      message: 'Erro ao testar conexão',
      error: error.message
    });
  }
}
