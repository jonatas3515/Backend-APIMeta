import { withAuth } from '@/lib/auth';
import { safeLog, safeError } from '@/lib/safeLogger';
import zlib from 'zlib';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb'
    }
  }
};

const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GEMINI_API_URL_PRIMARY = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_API_URL_FALLBACK = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

function extractTextFromDocxBuffer(buffer) {
  try {
    let offset = 0;
    while (offset < buffer.length - 30) {
      if (buffer.readUInt32LE(offset) === 0x04034b50) {
        const compMethod = buffer.readUInt16LE(offset + 8);
        const compSize = buffer.readUInt32LE(offset + 18);
        const fnLen = buffer.readUInt16LE(offset + 26);
        const extraLen = buffer.readUInt16LE(offset + 28);
        const filename = buffer.toString('utf8', offset + 30, offset + 30 + fnLen);
        const dataStart = offset + 30 + fnLen + extraLen;

        if (filename === 'word/document.xml') {
          const compressedData = buffer.slice(dataStart, dataStart + compSize);
          let xml = '';
          if (compMethod === 8) {
            xml = zlib.inflateRawSync(compressedData).toString('utf8');
          } else {
            xml = compressedData.toString('utf8');
          }
          return xml
            .replace(/<w:p[^>]*>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .trim();
        }
        offset = dataStart + compSize;
      } else {
        offset++;
      }
    }
  } catch (err) {
    console.error('[EXTRACT_AI] Erro ao descompactar DOCX:', err);
  }
  return null;
}

const SYSTEM_INSTRUCTION = `Você é um Especialista Sênior em Automação Jurídica e Padronização Documental da Neves & Costa Advocacia e Consultoria.
Sua missão é analisar o documento jurídico fornecido (em formato PDF, texto de Word ou rascunho de petição/contrato) e transformá-lo em um MODELO (TEMPLATE) PADRONIZADO E REUTILIZÁVEL para o sistema do escritório.

DIRETRIZES DE PADRONIZAÇÃO DE VARIÁVEIS (PLACEHOLDERS):
1. Substitua dados específicos de partes ou casos por placeholders entre chaves duplas {{nome_da_variavel}}.
Utilize estritamente os nomes padrão abaixo sempre que aplicável:
- {{client_name}} : Nome completo do cliente / outorgante / contratante
- {{cpf}} : CPF do cliente (ex: 000.000.000-00)
- {{rg}} : Número do RG
- {{rg_expeditor}} : Órgão emissor do RG (ex: SSP/BA)
- {{marital_status}} : Estado civil (solteiro(a), casado(a), em união estável...)
- {{profession}} : Profissão (lavrador, manicure, autônomo, comerciante...)
- {{birth_date}} : Data de nascimento (ex: 15 de março de 1985)
- {{mother_name}} : Nome da mãe
- {{father_name}} : Nome do pai
- {{address}} : Endereço completo (Rua, Número, Complemento)
- {{neighborhood}} : Bairro
- {{municipality}} : Cidade / Comarca
- {{state}} : Sigla do estado (BA, ES, MG...)
- {{cep}} : CEP (ex: 45836-000)
- {{client_phone}} : Telefone ou WhatsApp
- {{case_summary}} : Objeto da ação ou resumo da causa
- {{promovido}} : Nome da parte contrária / empresa ré
- {{honorarios_total}} : Valor total dos honorários contratados
- {{numero_parcelas}} : Número de parcelas
- {{valor_parcela}} : Valor da parcela
- {{dia_vencimento}} : Dia de vencimento das parcelas
- {{data_primeira_parcela}} : Data da primeira parcela
- {{date}} : Data do documento
- {{year}} : Ano corrente

2. DADOS DO ESCRITÓRIO:
Mantenha os dados profissionais do escritório Neves & Costa:
- Dr. JONATAS DO NASCIMENTO COSTA, OAB/BA 69.148
- Dr. OSMAR ALVES DAS NEVES FILHO, OAB/BA 58.799
- Endereço profissional: Rua Palmeiras, n.º 105, Novo Prado, Itamaraju – Bahia, CEP 45.836-000.

3. RETORNO OBRIGATÓRIO EM JSON ESTREITO:
Retorne EXCLUSIVAMENTE um objeto JSON válido (sem comentários adicionais, sem texto introdutório):
{
  "name": "Nome claro e profissional do template (ex: Contrato de Honorários - Ação Ordinária)",
  "description": "Breve explicação da finalidade deste documento no escritório",
  "legal_area": "Área do direito (ex: Direito do Consumidor, Direito Trabalhista, Direito Previdenciário, Direito Civil, Direito Administrativo, Geral)",
  "case_type": "Tipo específico de documento/rito (ex: Procuração, Contrato de Honorários, Petição Inicial, Justiça Gratuita, Execução, etc.)",
  "template_text": "Texto completo e integral da peça, perfeitamente estruturado e formatado, com todos os {{placeholders}} aplicados",
  "placeholders": ["client_name", "cpf", "rg", "..."]
}`;

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GOOGLE_AI_API_KEY não configurada no servidor' });
  }

  try {
    const { fileBase64, mimeType, filename, rawText } = req.body || {};

    if (!fileBase64 && !rawText) {
      return res.status(400).json({ error: 'Envie um arquivo PDF/.docx ou o texto do documento' });
    }

    let contentsParts = [];

    // Se for arquivo DOCX
    const isDocx = (filename && filename.toLowerCase().endsWith('.docx')) ||
                   (mimeType && mimeType.includes('openxmlformats'));

    if (fileBase64 && isDocx) {
      const buffer = Buffer.from(fileBase64, 'base64');
      const textFromDocx = extractTextFromDocxBuffer(buffer);
      if (!textFromDocx) {
        return res.status(400).json({ error: 'Não foi possível ler o arquivo DOCX. Tente salvá-lo em PDF ou colar o texto.' });
      }
      contentsParts.push({
        text: `Por favor, analise a seguinte minuta jurídica extraída de documento .docx e gere o template padronizado conforme as instruções:\n\n${textFromDocx}`
      });
    } else if (fileBase64) {
      // PDF nativo ou outro documento suportado pela Gemini
      const pdfMime = mimeType || 'application/pdf';
      contentsParts.push({
        text: 'Por favor, analise a minuta jurídica deste arquivo em anexo e gere o template padronizado conforme as instruções.'
      });
      contentsParts.push({
        inlineData: {
          mimeType: pdfMime,
          data: fileBase64
        }
      });
    } else {
      // Texto simples colado
      contentsParts.push({
        text: `Por favor, analise a seguinte minuta jurídica e gere o template padronizado conforme as instruções:\n\n${rawText}`
      });
    }

    safeLog('info', 'template_ai_extract_start', {
      hasFile: !!fileBase64,
      isDocx,
      hasText: !!rawText
    });

    const callModel = async (url) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ parts: contentsParts }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);
      return resp;
    };

    let response = await callModel(GEMINI_API_URL_PRIMARY);
    if (!response.ok) {
      console.warn('[EXTRACT_AI] Falha na URL primária, tentando fallback...');
      response = await callModel(GEMINI_API_URL_FALLBACK);
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erro na API Gemini: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    let rawReply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extrai o bloco JSON
    let jsonMatch = rawReply.match(/```json\s*([\s\S]*?)\s*```/);
    let jsonString = jsonMatch ? jsonMatch[1] : rawReply;

    let parsed;
    try {
      parsed = JSON.parse(jsonString.trim());
    } catch (parseErr) {
      // Tentativa de limpar delimitadores adicionais
      const start = jsonString.indexOf('{');
      const end = jsonString.lastIndexOf('}');
      if (start >= 0 && end > start) {
        parsed = JSON.parse(jsonString.slice(start, end + 1));
      } else {
        throw new Error('A IA não retornou um formato JSON válido.');
      }
    }

    return res.status(200).json({
      success: true,
      template: parsed
    });
  } catch (error) {
    safeError('template_ai_extract_error', error);
    return res.status(500).json({
      error: error.message || 'Erro ao processar documento com IA'
    });
  }
}

export default withAuth(handler, { minRole: 'advogado' });
