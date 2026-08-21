// Insere modelo RAG Obrigação de fazer como rascunho.

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const envPaths = [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '.env.local')];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
        }
      }
    }
  }
}

loadEnv();

const candidateUrls = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL]
  .filter(Boolean)
  .filter(u => /^https?:\/\//i.test(u));
const url = candidateUrls[0];
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('URL HTTPS e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const patterns = [
  { regex: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{14}\b/g, label: '[CNPJ]' },
  { regex: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g, label: '[CPF]' },
  { regex: /\b\d{1,2}\.?\d{3}\.?\d{3}-?\d[0-9Xx]\b/g, label: '[RG]' },
  { regex: /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b|\b\d{20}\b/g, label: '[PROCESSO]' },
  { regex: /\S+@\S+\.\S+/g, label: '[EMAIL]' },
  { regex: /\b(?:\(?\d{2}\)?[\s\-]?\d{4,5}[\s\-]?\d{4})\b/g, label: '[TELEFONE]' },
  { regex: /\b(?:\d{1,3}(?:[.\s]\d{3})+|\d+)[\s,;]+(?:reais|real|R\$|\$)\b/gi, label: '[VALOR]' },
  { regex: /\b(?:Rua|Av\.?|Avenida|Travessa|Alameda|Rodovia|BR-\d+|Est\.?|Praça)\s[^,\n]{5,80}[\d\-]{0,10}/gi, label: '[ENDEREÇO]' },
];

function anonymizeText(text) {
  if (!text) return '';
  let anon = text;
  patterns.forEach(({ regex, label }) => {
    anon = anon.replace(regex, label);
  });
  return anon;
}

function chunkText(text, maxLength = 1200, overlap = 120) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLength, text.length);
    if (end < text.length) {
      const breaks = ['\n\n', '. ', '\n'];
      const indices = breaks.map(b => text.lastIndexOf(b, end)).filter(i => i > start);
      if (indices.length) end = Math.max(...indices) + 1;
    }
    chunks.push(text.slice(start, end).trim());
    start = Math.max(end - overlap, start + 1);
    if (end === text.length) break;
  }
  return chunks.filter(c => c.length > 50);
}

const content = `AO JUÍZO DO JUIZADO ESPECIAL CÍVEL DA COMARCA DE [MUNICÍPIO]/[ESTADO]

[NOME DA PARTE AUTORA], qualificada, propõe AÇÃO DE OBRIGAÇÃO DE FAZER C/C INDENIZAÇÃO POR DANOS MATERIAIS E MORAIS em face de [FORNECEDOR].

Estrutura usada pelo escritório:
1. Gratuidade da justiça: art. 98 e seguintes do CPC; art. 5º, LXXIV, da CF, se presentes os requisitos.
2. Fatos: consumidora adquiriu produto/maquinário por canal eletrônico, pagou total ou parcialmente, recebeu prazo de entrega, mas o produto não foi entregue. Tentativas de solução administrativa foram frustradas. O bem pode ser relevante para atividade profissional ou pessoal, conforme prova do caso.
3. Relação de consumo: aplicação do CDC; inversão do ônus da prova, art. 6º, VIII, quando houver verossimilhança/hipossuficiência.
4. Descumprimento da oferta e falha do serviço: examinar arts. 14, 30, 35 e 6º, VI, do CDC conforme os pedidos e fatos comprovados.
5. Danos materiais: restituição do que foi efetivamente pago, nos limites juridicamente cabíveis e comprovados. Não assumir repetição em dobro automaticamente; avaliar art. 42, parágrafo único, do CDC conforme a natureza da cobrança e boa-fé objetiva.
6. Danos morais: não tratar todo inadimplemento como dano moral automático. Fundamentar em circunstâncias qualificadas, como descaso, demora relevante, ausência de solução, retenção de valores, frustração grave e prova dos transtornos.
7. Pedidos: justiça gratuita; inversão do ônus; citação; entrega do produto ou restituição, conforme opção processual e fatos; danos materiais comprovados; danos morais se cabíveis; provas.

Observações RAG:
- Usar [PRODUTO], [VALOR], [DATA], [FORNECEDOR], [COMPROVANTE] e [PRAZO DE ENTREGA].
- Não inserir telefone, dados de cartão, Pix, e-mail, imagens de conversa ou dados de cliente.
- Não inventar jurisprudência, valores ou fatos.`;

const document = {
  title: 'Modelo — Obrigação de fazer por produto não entregue',
  type: 'modelo_peca',
  area: 'consumerista',
  tribunal: 'TJBA',
  tags: ['produto não entregue', 'descumprimento da oferta', 'obrigação de fazer', 'danos materiais', 'danos morais', 'inversão do ônus'],
  version: 'v1.0',
  content,
  status: 'rascunho',
  created_by: null
};

async function seed() {
  const anonContent = anonymizeText(document.content);
  const chunks = chunkText(anonContent);

  const { data: doc, error: docError } = await supabase
    .from('knowledge_documents')
    .insert({
      ...document,
      content: anonContent
    })
    .select('id, title, status, version')
    .single();

  if (docError) {
    console.error('[SEED] Erro ao inserir documento:', docError);
    process.exit(1);
  }

  if (chunks.length > 0) {
    const chunkRows = chunks.map((text, idx) => ({
      document_id: doc.id,
      chunk_index: idx,
      content: text
    }));

    const { error: chunkError } = await supabase.from('knowledge_chunks').insert(chunkRows);
    if (chunkError) {
      console.error('[SEED] Erro ao inserir chunks:', chunkError);
      process.exit(1);
    }
  }

  console.log(JSON.stringify({
    id: doc.id,
    title: doc.title,
    status: doc.status,
    version: doc.version,
    chunks: chunks.length
  }));

  process.exit(0);
}

seed().catch(err => {
  console.error('[SEED] Erro inesperado:', err);
  process.exit(1);
});
