import { supabaseServer } from './supabaseServer';

/**
 * Gera URL temporaria (signed URL) para acesso a um arquivo no Supabase Storage.
 * Nunca registra storage_path, filename ou URLs em console.
 * @param {string} bucket
 * @param {string} path
 * @param {number} expiresIn segundos (padrao 120)
 */
export async function getSignedUrl(bucket, path, expiresIn = 120) {
  if (!supabaseServer) {
    throw new Error('Supabase nao configurado');
  }
  if (!bucket || !path) {
    throw new Error('Bucket e path sao obrigatorios');
  }

  const { data, error } = await supabaseServer.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error('[STORAGE] Erro ao gerar URL temporaria');
    throw new Error('Erro ao gerar URL temporaria');
  }

  return data?.signedUrl || null;
}

/**
 * Faz upload de um buffer/arquivo para o bucket 'chat-files'.
 * Nunca registra o caminho em console.
 * @param {string} path destino, ex: cases/{caseId}/{documentId}-{safeName}
 * @param {Buffer|File} file
 * @param {string} contentType
 */
export async function uploadCaseFile(path, file, contentType) {
  if (!supabaseServer) {
    throw new Error('Supabase nao configurado');
  }

  const { data, error } = await supabaseServer.storage
    .from('chat-files')
    .upload(path, file, {
      contentType,
      upsert: false
    });

  if (error) {
    console.error('[STORAGE] Erro no upload');
    throw new Error('Erro ao fazer upload do arquivo');
  }

  return data?.path || null;
}
