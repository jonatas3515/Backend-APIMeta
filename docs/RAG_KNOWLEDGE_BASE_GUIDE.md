# Base de Conhecimento do Escritório — RAG

## Visão geral

A base de conhecimento permite que a IA do sistema use documentos internos do escritório (modelos de peças, cláusulas, teses, checklists e jurisprudência selecionada) como contexto para respostas e rascunhos jurídicos.

A abordagem adotada é **RAG (Retrieval-Augmented Generation)** com busca full-text no PostgreSQL/Supabase, sem exposição de documentos brutos no frontend.

## Arquitetura

1. **Banco de dados** (`supabase/migrations/050_office_knowledge_base.sql`)
   - `knowledge_documents`: metadados e status.
   - `knowledge_chunks`: trechos indexáveis do conteúdo.
   - `knowledge_query_logs`: registro anônimo de consultas.
2. **Anonimização** (`lib/anonymize.js`): remove/mascara CPF, CNPJ, RG, processos, e-mails, telefones, endereços e valores.
3. **Chunking** (`lib/chunkText.js`): divide documentos em trechos de ~1.200 caracteres.
4. **Busca** (`lib/knowledgeSearch.js`): usa a função `search_knowledge` do PostgreSQL (full-text `portuguese`).
5. **IA** (`lib/aiRag.js` + `pages/api/ai/ask.js`): monta prompt com trechos relevantes e chama o Gemini.
6. **Ingestão** (`pages/api/knowledge/documents.js`): importa documentos anonimizados.

## Como adicionar documentos

### 1. Criar/atualizar o banco

Aplique a migration `050_office_knowledge_base.sql` no Supabase:

```bash
# via Supabase CLI (se configurado)
supabase db push
```

Ou execute o conteúdo do SQL no Editor SQL do Supabase.

### 2. Inserir documentos via API

Envie um POST autenticado para `/api/knowledge/documents`:

```bash
curl -X POST https://backend-apimeta.vercel.app/api/knowledge/documents \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Modelo de Contestação Trabalhista",
    "type": "modelo_peca",
    "area": "trabalhista",
    "tribunal": "TRT5",
    "tags": ["contestação", "rescisão indireta"],
    "content": "<conteúdo limpo do documento>",
    "status": "rascunho"
  }'
```

Tipos permitidos: `modelo_peca`, `clausula`, `tese`, `checklist`, `jurisprudencia`.

A anonimização e o chunking ocorrem automaticamente no servidor.

### 3. Aprovar documentos

Apenas documentos `aprovado` são usados pela IA.

```bash
curl -X PATCH https://backend-apimeta.vercel.app/api/knowledge/documents \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"id": "<UUID>", "status": "aprovado"}'
```

### 4. Dados de teste

Use o seed para popular exemplos iniciais:

```bash
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-knowledge.js
```

## Como usar o Assistente IA

1. Acesse a aba **🧠 IA** no menu lateral.
2. Digite uma pergunta ou comando.
3. Opcionalmente filtre por área, tribunal e tipo de documento.
4. A IA responde baseada apenas nos documentos aprovados.
5. Abaixo da resposta aparecem os **metadados das fontes consultadas**.

## Segurança

- Documentos brutos e chunks não são expostos diretamente ao frontend.
- A busca e a montagem do contexto ocorrem em `pages/api/ai/ask.js`.
- Controle de acesso por role: `admin`, `advogado` e `estagiario`.
- Logs registram apenas query, filtros e IDs dos documentos usados — sem a resposta completa.

## Ajustes de prompt

O prompt do RAG está em `lib/aiRag.js` (`RAG_SYSTEM_PROMPT`). Altere-o para refinar o tom, a formalidade ou as instruções de citação.

## Limitações atuais

- Busca full-text sem embeddings vetoriais (suficiente para centenas de documentos).
- Anonimização baseada em expressões regulares; documentos sensíveis devem ser revisados antes da aprovação.
- Não é realizada inferência de jurisprudência fora da base fornecida.
