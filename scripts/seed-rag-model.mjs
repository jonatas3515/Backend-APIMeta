// Insere um modelo RAG como rascunho (não aprova automaticamente).
// Uso: node scripts/seed-rag-model.mjs

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

[NOME DA PARTE AUTORA], qualificada, propõe AÇÃO ANULATÓRIA DE DÉBITO C/C INDENIZAÇÃO POR DANOS MORAIS, COM PEDIDO DE TUTELA DE URGÊNCIA, em face de [CONCESSIONÁRIA DE ENERGIA].

Estrutura usada pelo escritório:
1. Gratuidade da justiça: art. 98 do CPC e art. 5º, LXXIV, da CF.
2. Fatos: consumidora com histórico regular de consumo recebe fatura abruptamente elevada, incompatível com a média habitual. Busca revisão administrativa sem solução e teme corte do serviço e negativação.
3. CDC: relação de consumo; responsabilidade objetiva do fornecedor, art. 14; dever de serviço adequado, eficiente, seguro e contínuo para serviço essencial, art. 22.
4. Fundamentos constitucionais: proteção à reparação por danos e responsabilidade de prestadora de serviço público, conforme aplicável ao caso concreto.
5. Hipossuficiência e inversão do ônus: vulnerabilidade técnica do consumidor quanto a medição, leitura e faturamento.
6. Tutela de urgência: art. 300 do CPC; probabilidade do direito e perigo de dano pela ameaça de interrupção de serviço essencial. Pedir manutenção do fornecimento e refaturamento conforme média de consumo, quando os elementos do caso justificarem.
7. Pedidos: justiça gratuita; tutela; citação; declaração de inexigibilidade/nulidade da cobrança abusiva; refaturamento; vedação de corte/negativação relacionada ao débito discutido; danos morais quando comprovados; inversão do ônus da prova; provas.

Observações RAG:
- Não inventar valores, média de consumo, datas, unidade consumidora, matrícula ou jurisprudência.
- Usar placeholders como [VALOR], [MÉDIA DE CONSUMO], [DATA], [UNIDADE CONSUMIDORA].
- Qualquer jurisprudência futura deve ser conferida em fonte oficial antes de ser apresentada como atual.`;

const document = {
  title: 'Modelo — Ação anulatória de débito por cobrança de energia',
  type: 'modelo_peca',
  area: 'consumerista',
  tribunal: 'TJBA',
  tags: ['cobrança indevida', 'energia elétrica', 'refaturamento', 'tutela de urgência', 'danos morais', 'CDC'],
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
