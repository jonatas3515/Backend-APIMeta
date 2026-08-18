// Popula a base de conhecimento com documentos de teste.
// Uso: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-knowledge.js

const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const samples = [
  {
    title: 'Petição inicial - Cobrança indevida consumerista',
    type: 'modelo_peca',
    area: 'consumidor',
    tribunal: 'TJBA',
    tags: ['cobrança indevida', 'danos morais', 'repetição em dobro'],
    content: `EXCELENTÍSSIMO(A) SENHOR(A) JUIZ(A) DE DIREITO DA VARA DO JUIZADO ESPECIAL CÍVEL DA COMARCA DE [MUNICÍPIO] – ESTADO DA BAHIA.

A parte autora vem, por seu procurador, com fundamento no Código de Defesa do Consumidor, propor a presente AÇÃO DE COBRANÇA INDEVIDA c/c INDENIZAÇÃO POR DANOS MORAIS e REPETIÇÃO DO INDÉBITO em DOBRO em face de [RÉU].

I – DOS FATOS
A parte autora teve seu nome inscrito em cadastros de proteção ao crédito indevidamente, tendo sofrido danos morais pela negativação. O valor cobrado não corresponde a nenhuma relação jurídica válida.

II – DO DIREITO
Configura-se a cobrança indevida a partir da inscrição irregular. Incidem os arts. 6º, 14, 42 e 56 do CDC. A repetição em dobro está prevista no art. 42, parágrafo único, do CDC, e os danos morais decorrem da indevida inscrição.`
  },
  {
    title: 'Cláusula de rescisão contratual',
    type: 'clausula',
    area: 'civel',
    tribunal: null,
    tags: ['rescisão', 'contrato', 'prestação de serviços'],
    content: `CLÁUSULA DÉCIMA - DA RESCISÃO

Em caso de rescisão antecipada por iniciativa do CONTRATANTE, este ficará obrigado ao pagamento dos honorários devidos até a data do efetivo encerramento dos trabalhos, nos termos do art. 1.024 do Código Civil.

Na hipótese de rescisão por inadimplemento de qualquer das partes, o inadimplente arcará com multa equivalente a 10% (dez por cento) do valor remanescente do contrato, sem prejuízo de perdas e danos.`
  },
  {
    title: 'Tese - Revisional de contrato bancário',
    type: 'tese',
    area: 'civel',
    tribunal: 'TRF1',
    tags: ['revisional', 'juros abusivos', 'contrato bancário'],
    content: `TESE: É cabível a revisão de cláusulas contratuais bancárias quando o montante de juros, tarifas e seguros demonstra inequívoco desequilíbrio contratual, configurando cláusula abusiva a ser reduzida nos termos do art. 51 e 54 do CDC e art. 478 do Código Civil.

FUNDAMENTOS: O Código de Defesa do Consumidor veda cláusulas que estipulem obrigações consideradas excessivamente onerosas. A revisão deve limitar-se à taxa de juros média de mercado e excluir cobranças de tarifas não contratadas ou sem contraprestação efetiva.`
  },
  {
    title: 'Checklist - Ação de alimentos',
    type: 'checklist',
    area: 'familia',
    tribunal: null,
    tags: ['alimentos', 'família', 'documentos'],
    content: `CHECKLIST - AÇÃO DE ALIMENTOS

1. Certidão de nascimento do filho menor ou maior dependente.
2. Comprovante de residência e renda do genitor.
3. Declaração de comparecimento do demandado.
4. Comprovante das necessidades básicas do alimentando (escola, saúde, alimentação).
5. Laudo de impossibilidade, se houver necessidade especial.
6. Procuração ad judicia com poderes específicos para ação de família.`
  },
  {
    title: 'Jurisprudência - Danos morais em negativação indevida',
    type: 'jurisprudencia',
    area: 'consumidor',
    tribunal: 'TJBA',
    tags: ['danos morais', 'negativação indevida', 'consumidor'],
    content: `EMENTA: A indevida inscrição do nome do consumidor em cadastro de inadimplentes gera dano moral in re ipsa, independentemente de prova de prejuízo patrimonial, configurando responsabilidade objetiva do fornecedor nos termos do art. 14 do CDC.

A simples manutenção da negativação após comprovado o pagamento ou inexistência da dívida é suficiente para caracterizar o dano moral, sendo devida a indenização.`
  }
];

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

async function seed() {
  for (const sample of samples) {
    const { data: doc, error: docError } = await supabase
      .from('knowledge_documents')
      .insert({
        title: sample.title,
        type: sample.type,
        area: sample.area,
        tribunal: sample.tribunal,
        tags: sample.tags,
        status: 'aprovado',
        version: 'v1.0',
        content: sample.content,
        created_by: null
      })
      .select()
      .single();

    if (docError) {
      console.error('Erro ao inserir documento:', docError);
      continue;
    }

    const chunks = chunkText(sample.content).map((text, idx) => ({
      document_id: doc.id,
      chunk_index: idx,
      content: text
    }));

    if (chunks.length) {
      const { error: chunkError } = await supabase.from('knowledge_chunks').insert(chunks);
      if (chunkError) console.error('Erro ao inserir chunks:', chunkError);
    }

    console.log('Inserido:', sample.title, '- chunks:', chunks.length);
  }

  console.log('Seed concluído.');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
