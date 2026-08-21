// Insere modelo RAG Cobrança duplicada como rascunho.

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

[NOME DA PARTE AUTORA], qualificada, propõe AÇÃO DE REPARAÇÃO DE DANOS MATERIAIS E MORAIS C/C REPETIÇÃO DE INDÉBITO em face de [FORNECEDOR 1] e [INSTITUIÇÃO FINANCEIRA/ADMINISTRADORA].

Estrutura usada pelo escritório:
1. Fatos: compra/transação processada em duplicidade; uma cobrança deveria existir, mas houve débito duplicado. O consumidor contesta tempestivamente. Pode haver confusão entre estorno de transação, reembolso de operação diversa, crédito provisório e reinclusão de cobrança. Organizar os fatos por cronologia e por documentos.
2. CDC: consumidor e fornecedores, arts. 2º e 3º; responsabilidade objetiva por falha do serviço, art. 14; reparação integral e inversão do ônus, art. 6º, VI e VIII.
3. Responsabilidade solidária: analisar cadeia de fornecimento e participação de cada ré; usar arts. 7º, parágrafo único, e 25, §1º, do CDC quando aplicáveis aos fatos.
4. Cobrança indevida: art. 42, parágrafo único, do CDC. A repetição em dobro exige análise da conduta contrária à boa-fé objetiva e da exceção de engano justificável. Não afirmar cabimento automático.
5. Tema 929 do STJ: registrar apenas como referência jurídica usada pelo escritório: a repetição em dobro do art. 42, parágrafo único, do CDC se relaciona à cobrança indevida contrária à boa-fé objetiva. Exigir validação atual em fonte oficial antes de uso em peça final.
6. Dano moral: avaliar o conjunto das circunstâncias, como valor relevante, tempo sem solução, sucessivas reclamações, erro de análise, negativa abusiva, retenção indevida e peregrinação entre fornecedores. Não presumir dano moral em toda duplicidade.
7. Pedidos: inversão do ônus; justiça gratuita, se cabível; declaração de inexigibilidade; restituição/repetição conforme prova e direito aplicável; danos materiais; danos morais se demonstrados; solidariedade, quando cabível; provas.

Observações RAG:
- Usar [VALOR], [DATA], [PROTOCOLO], [CARTÃO], [RESERVA], [BILHETE] e [FORNECEDOR].
- Não incluir números de cartão, protocolos, reservas, bilhetes, faturas, nomes ou e-mails reais.
- Não citar julgados específicos sem validação oficial.`;

const document = {
  title: 'Modelo — Cobrança duplicada e repetição do indébito',
  type: 'modelo_peca',
  area: 'consumerista',
  tribunal: 'TJBA',
  tags: ['cobrança duplicada', 'cartão de crédito', 'repetição do indébito', 'responsabilidade solidária', 'banco', 'companhia aérea', 'danos morais'],
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
