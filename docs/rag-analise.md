# Análise e Plano — Base de Conhecimento Jurídico (RAG) + Padrão de Linguagem do Bot

## 1. Contexto

O repositório já possui uma implementação inicial de RAG (`docs/RAG_KNOWLEDGE_BASE_GUIDE.md`) baseada em:

- `knowledge_documents` (metadados, status)
- `knowledge_chunks` (full-text `portuguese`)
- `knowledge_query_logs` (consultas anonimizadas)
- `lib/knowledgeSearch.js` (busca full-text via `search_knowledge`)
- `lib/aiRag.js` (respostas com contexto restrito)
- `pages/api/ai/ask.js` (endpoint para advogados)
- `pages/api/knowledge/documents.js` (ingestão e gestão)
- `components/KnowledgeBaseManager.js` (interface de gestão)

Essa análise documenta o estado atual, propõe evoluções e define o padrão de linguagem do bot.

## 2. Levantamento do bot e canais de resposta

### 2.1 Onde o bot responde hoje

| Canal/Fluxo | Arquivo principal | Descrição |
|---|---|---|
| WhatsApp inbound | `pages/api/webhook.js` | Recebe mensagens, processa intake, chama `askGemini` local e `lib/ai.js` para áudio |
| Assistente IA para advogados | `pages/api/ai/ask.js` | Consulta base de conhecimento e gera resposta com `lib/aiRag.js` |
| Envio de mensagens | `pages/api/whatsapp/send-message.js` | Mensagens humanas e templates, sem geração IA no fluxo principal |
| Lembretes | `lib/reminders.js` / rotinas | Mensagens de follow-up pré-definidas |

### 2.2 Base de conhecimento existente

- **Tabelas**: `knowledge_documents`, `knowledge_chunks`, `knowledge_query_logs` (migration `050_office_knowledge_base.sql`).
- **Tipos suportados**: `modelo_peca`, `clausula`, `tese`, `checklist`, `jurisprudencia`.
- **Ciclo de vida**: `rascunho` → `revisado` → `aprovado`.
- **Anonimização**: `lib/anonymize.js` remove CPF, CNPJ, RG, processos, e-mails, telefones, endereços e valores.
- **Chunking**: `lib/chunkText.js` gera trechos de ~1.200 caracteres.
- **Busca**: full-text PostgreSQL (`portuguese`), sem embeddings vetoriais.
- **Integração com bot**: hoje, **não**. O WhatsApp usa `lib/ai.js` (Gemini sem contexto da base). O RAG está disponível apenas no painel de IA.

### 2.3 Fontes externas potenciais

- Jurisprudência: STJ, STF, TST, Tribunais Regionais (dados públicos via Diário da Justiça, jurisprudência.tst.jus.br, etc.).
- Legislação: Planalto (`legisla.presidencia.gov.br`), LexML.
- Súmulas: STJ, STF, TST.
- Modelos de peças: internos do escritório (não expor ao público).

> Nota: importação de fontes externas exige curadoria, anonimização e revisão. Recomenda-se não importar automaticamente sem validação humana.

## 3. Requisitos funcionais propostos

### 3.1 Base de conhecimento

- Manter cadastro de documentos jurídicos (`knowledge_documents`) com título, tipo, área, tribunal, tags e status.
- Busca semântica/textual por conteúdo e metadados.
- Vincular trechos relevantes a casos/conversas (indicar `document_id` nos chunks retornados).
- Auditoria de consultas em `knowledge_query_logs` (já existe).
- Controle de versão: campo `version` já existe; recomenda-se versionamento manual no título ou campo.

### 3.2 Respostas do bot enriquecidas

- Quando o cliente fizer uma pergunta jurídica no WhatsApp, o bot pode consultar `search_knowledge` antes de responder.
- Respostas devem citar o tipo de documento e, se possível, tribunal/área (ex: "Conforme jurisprudência do STJ...").
- Se não houver trechos relevantes, o bot deve dizer explicitamente que não há base suficiente e encaminhar para a equipe, se necessário.
- Evitar alucinação: o prompt deve instruir a usar **apenas** os trechos fornecidos.

### 3.3 Padrão de linguagem do bot

- Respostas naturais, cordiais e respeitosas.
- Português correto:
  - "Obrigado/Obrigada" → "De nada.", "Por nada.", "Ficamos felizes em ajudar.", "Estamos à disposição."
  - NUNCA responder "Entendi" a um agradecimento.
- Tom alegre, mas profissional.
- Adaptar ao contexto: formal em dúvidas jurídicas, leve em saudações.
- Não usar nome do cliente para iniciar frases.
- Respostas objetivas (1-3 frases curtas).

Implementado em `lib/bot-responses.js` e aplicado em `lib/ai.js` e `pages/api/webhook.js`.

## 4. Impactos técnicos e riscos

### 4.1 Backend

- **Novo schema**: não necessário no curto prazo; as tabelas `knowledge_*` já existem.
- **Embeddings**: a busca full-text atende a centenas de documentos. Vetores exigiriam `pgvector`/coluna de embedding e aumento de custo.
- **Integração LLM**: `lib/aiRag.js` já faz RAG com Gemini. Reutilizar para WhatsApp exige adicionar `searchKnowledge` no fluxo do webhook.
- **Latência**: consultar Supabase + Gemini aumenta tempo de resposta do webhook. Recomenda-se timeout curto (≤15s) e fallback simples.

### 4.2 Frontend

- O `KnowledgeBaseManager` já oferece gestão básica.
- Futura interface de busca para advogados pode reutilizar `pages/api/ai/ask.js`.

### 4.3 Riscos

- **Custo**: mais chamadas ao Gemini e processamento de textos.
- **Precisão jurídica**: respostas são auxiliares e devem ser revisadas por advogado.
- **LGPD**: textos importados devem ser anonimizados antes de aprovação; logs de consulta já são anonimizados.
- **Alucinação**: risco mitigado ao restringir o contexto aos trechos recuperados e instruções claras no prompt.

## 5. Plano de implementação em fases

### Fase 1 — Análise e padrão de linguagem (atual)

- Levantar estado do RAG e canais do bot.
- Documentar proposta em `docs/rag-analise.md`.
- Criar `lib/bot-responses.js` com respostas padrão e instruções de tom.
- Aplicar `lib/bot-responses.js` em `lib/ai.js` e `pages/api/webhook.js`.
- Criar testes `__tests__/bot-responses.test.js`.

### Fase 2 — Base de conhecimento

- Validar uso do `KnowledgeBaseManager` para cadastro de documentos.
- Garantir anonimização antes de aprovação.
- Adicionar filtros por área/tribunal/tipo na interface.
- Melhorar busca com sinônimos jurídicos (expansão de query) sem embeddings.

### Fase 3 — Integração com o bot

- No `webhook.js`, antes de chamar `askGemini`, executar `searchKnowledge` para perguntas jurídicas.
- Montar prompt com trechos relevantes usando `lib/aiRag.js` ou função similar.
- Limitar respostas do WhatsApp a contexto aprovado e instruções de citação.
- Adicionar log em `knowledge_query_logs` quando o bot consultar a base.

### Fase 4 — Melhorias

- Avaliar migração para embeddings vetoriais (`pgvector`) se o volume crescer.
- Métricas de qualidade: taxa de satisfação, erros, consultas sem resposta.
- Integração com fontes públicas curadas (jurisprudência, súmulas) via scripts de importação.

## 6. Restrições mantidas

- Nenhuma alteração de schema, banco, RLS ou migration foi executada.
- Nenhuma integração externa nova foi adicionada.
- PII, credenciais e tokens continuam protegidos.
- O arquivo `scripts/apply-migration-056.js` não foi alterado.
