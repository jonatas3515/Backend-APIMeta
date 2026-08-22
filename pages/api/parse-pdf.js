import { withAuth } from '@/lib/auth';
import { parsePdfTable } from '@/lib/parsePdfTable';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { file } = req.body;
    if (!file) {
      return res.status(400).json({ error: 'Arquivo não enviado' });
    }

    const buffer = Buffer.from(file, 'base64');
    if (buffer.length === 0) {
      return res.status(400).json({ error: 'Arquivo vazio' });
    }

    const tableData = await parsePdfTable(buffer);

    // Nao loga PII
    console.log('[PARSE-PDF] Linhas extraídas:', tableData.length);

    if (tableData.length === 0) {
      return res.status(422).json({
        error: 'Não foi possível extrair tabela do PDF. O arquivo pode ser uma imagem ou nao conter texto selecionavel. Converta para CSV/Excel.'
      });
    }

    return res.status(200).json({ tableData });
  } catch (error) {
    console.error('[PARSE-PDF] Erro completo:', error);
    console.error('[PARSE-PDF] Stack:', error.stack);
    return res.status(500).json({ error: `Erro ao processar PDF: ${error.message}` });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
