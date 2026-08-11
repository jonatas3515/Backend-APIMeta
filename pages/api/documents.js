import { generateDocument, getTemplateList } from '../../lib/documentTemplates';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb'
    }
  }
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Listar templates disponíveis
    return res.status(200).json({
      success: true,
      templates: getTemplateList()
    });
  }
  
  if (req.method === 'POST') {
    const { templateId, data } = req.body;
    
    if (!templateId || !data) {
      return res.status(400).json({ error: 'Template e dados são obrigatórios' });
    }
    
    try {
      const document = generateDocument(templateId, data);
      
      return res.status(200).json({
        success: true,
        document,
        templateId
      });
    } catch (error) {
      console.error('[DOCUMENTS] Erro ao gerar:', error);
      return res.status(400).json({ error: error.message });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}
