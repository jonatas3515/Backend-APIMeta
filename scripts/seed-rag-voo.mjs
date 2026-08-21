// Insere modelo RAG Cancelamento de voo como rascunho.

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

[NOME DA PARTE AUTORA], qualificada, propõe AÇÃO DE INDENIZAÇÃO POR DANOS MATERIAIS E MORAIS em face de [COMPANHIA AÉREA].

Estrutura usada pelo escritório:
1. Gratuidade da justiça: art. 98 do CPC e art. 5º, LXXIV, da CF, quando cabível.
2. Fatos: passageiro comparece para embarque; voo atrasa ou é cancelado; informação é tardia ou insuficiente; há reacomodação inadequada, mudança de aeroporto/cidade, falta de transporte, alimentação, comunicação ou suporte material. Organizar cronologia com documentos.
3. CDC: relação de consumo e responsabilidade objetiva, arts. 2º, 3º e 14; inversão do ônus, art. 6º, VIII, quando presentes os requisitos.
4. Resolução ANAC nº 400: usar como referência de estrutura para dever de informação, alternativas em atraso/cancelamento e assistência material. Conferir a redação vigente e a aplicabilidade antes de redigir peça final.
5. Referências normalmente utilizadas: arts. 20, 21, 26 e 27 da Resolução 400/ANAC, relativos a informação, alternativas e assistência material; conferir versão vigente em fonte oficial.
6. Danos materiais: exigir comprovantes e nexo com falha do serviço, por exemplo transporte, alimentação e hospedagem, quando aplicável.
7. Danos morais: fundamentar em circunstâncias concretas que superem mero aborrecimento: demora relevante, abandono, perda de evento importante, deslocamento forçado, falta de assistência, ansiedade e desorganização significativa.
8. Pedidos: justiça gratuita se cabível; citação; inversão do ônus; danos materiais comprovados; danos morais quando demonstrados; provas.

Observações RAG:
- Usar [VOO], [DATA], [AEROPORTO DE ORIGEM], [AEROPORTO DE DESTINO], [VALOR] e [EVENTO RELEVANTE].
- Não incluir reserva, bilhete, endereço, dados de cliente, imagens, comprovantes originais ou valores identificáveis.
- Não apresentar jurisprudência como atual sem consulta a fonte oficial.`;

const document = {
  title: 'Modelo — Cancelamento de voo e assistência material',
  type: 'modelo_peca',
  area: 'consumerista',
  tribunal: 'TJBA',
  tags: ['cancelamento de voo', 'atraso', 'transporte aéreo', 'assistência material', 'ANAC', 'danos materiais', 'danos morais'],
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
