import { withAuth } from '@/lib/auth';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Parse de PDF desabilitado temporariamente devido a limitacoes do ambiente serverless
  // Recomendacao: converter PDF para Excel/CSV antes do upload
  return res.status(501).json({
    error: 'Parse de PDF não suportado. Por favor, converta o PDF para Excel (.xlsx) ou CSV e faça o upload novamente. Você pode usar ferramentas online gratuitas como https://www.ilovepdf.com/pt/pdf_para_excel'
  });
}

export default withAuth(handler, { minRole: 'estagiario' });
