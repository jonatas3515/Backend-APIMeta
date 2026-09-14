# Avaliação de Baseline do RAG Jurídico

## 1. Objetivo

Este documento registra o estado atual do pipeline RAG do escritório sem alterar comportamento produtivo. Ele serve como baseline para futuras melhorias de precisão e confiabilidade.

## 2. Arquitetura do Pipeline

```
pergunta
  └─> pages/api/ai/ask.js
        ├─ autenticação (JWT + role admin/advogado/estagiario)
        ├─ normalização: trim, limite 1000 caracteres, mínimo 3 caracteres
        ├─ searchKnowledge({ query, status: 'aprovado', area, tribunal, type, limit: 8 })
        │       └─ lib/knowledgeSearch.js
        │              └─ supabase.rpc('search_knowledge', ...)
        │                     └─ PostgreSQL full-text 'portuguese' (migração 052)
        ├─ buildContext(results, MAX_CONTEXT_LENGTH=5000)
        ├─ askRag(query, context)
        │       └─ lib/aiRag.js
        │              ├─ sanitizePromptInput(query) — remove control chars e padrões de injection
        │              ├─ escapeContextDelimiters(context) — evita escape de delimitadores
        │              ├─ prompt = context + pergunta + diretrizes
        │              ├─ callGemini(prompt, RAG_SYSTEM_PROMPT, primary/fallback)
        │              └─ resposta texto
        ├─ métricas: emptyRetrieval, abstentionUsed, latencyMs
        ├─ log_audit + knowledge_query_logs
        └─ resposta JSON { answer, sources }
```

### 2.1 Mapeamento por etapa

| Etapa | Arquivo/FUNÇÃO | Entrada | Saída | Limites | Tratamento de erro | Risco conhecido |
|---|---|---|---|---|---|---|
| Autenticação | `pages/api/ai/ask.js` `getUserFromToken` | `Authorization: Bearer <JWT>` | `user` (id, email) | Token obrigatório | 401 / 403 | Tokens não devem vazar em logs |
| Autorização | `pages/api/ai/ask.js` `canUseAssistant` | `user.id` | boolean | roles permitidas | 403 | — |
| Normalização query | `pages/api/ai/ask.js` | `req.body.query` | `safeQuery` (≤1000, ≥3) | < 3 gera 400 | 400 | stopwords não são removidas nesta camada |
| Busca de chunks | `lib/knowledgeSearch.js` `searchKnowledge` | query + filtros | `results` (máx. 8), `documents` (unique) | `limit=8` hardcoded | exceção | score não é exposto; rank vem do PostgreSQL mas é descartado no slice |
| FTS PostgreSQL | `search_knowledge()` RPC (mig 052) | palavras-chave limpas | chunks ranqueados | LIMIT 20 | — | OR entre palavras pode trazer ruído; sem embeddings |
| Construção de contexto | `pages/api/ai/ask.js` `buildContext` | chunks | string ≤5000 chars | 5000 | break ao exceder | chunks duplicados entre documentos podem inflar o contexto |
| Sanitização da pergunta | `lib/aiRag.js` `sanitizePromptInput` | query bruta | query limpa | 1000 | — | padrões fixos de injection; não cobrem todos os vetores |
| Geração da resposta | `lib/aiRag.js` `askRag` | query + contexto | texto | 15s timeout | fallback model; 500 se ambos falham | resposta pode conter texto fora do contexto |
| Métricas | `pages/api/ai/ask.js` | resultados + resposta | logs estruturados | — | — | logs não incluem a resposta completa (apenas tamanho) |
| Auditoria | `pages/api/ai/ask.js` | user, query anonimizada, IDs | `log_audit` + `knowledge_query_logs` | — | erros audit são safe-logados | query é anonimizada antes do log |

## 3. Schema e Dados

- `knowledge_documents`: metadados, status (`rascunho`, `revisado`, `aprovado`), anonimização no insert.
- `knowledge_chunks`: conteúdo fragmentado, índice GIN full-text `portuguese`.
- `knowledge_query_logs`: query anonimizada, filtros e `document_ids_used`.
- RLS: `search_knowledge` é `SECURITY DEFINER` e só `service_role` pode executar; selects diretos em `knowledge_documents` e `knowledge_chunks` foram removidos (mig 051).

## 4. Pontos Fortes

1. Apenas documentos `aprovado` entram na busca (hardcoded em `searchKnowledge`, `semanticSearch` e na função SQL).
2. Busca filtra por `area`, `tribunal` e `type` quando fornecidos.
3. Anonimização antes da inserção.
4. Contexto truncado a 5000 caracteres para evitar prompts gigantes.
5. Prompt do RAG instrui explicitamente a usar apenas os trechos e a abstinência.
6. Fallback para segundo modelo Gemini.
7. Logs de segurança não contêm PII, respostas completas nem tokens.

## 5. Falhas e Riscos Identificados

1. **Full-text sem embeddings**: a busca depende de correspondência literal de palavras. Sinônimos jurídicos e variações de termo podem não ser encontrados.
2. **Limite `LIMIT 20` na função SQL**: `searchKnowledge` fatia em 8, mas a função retorna até 20. O score `rank` não é usado no cliente; ordenação do PostgreSQL é mantida.
3. **Chunks podem se sobrepor**: `chunkText` usa overlap 100-120, o que pode causar conteúdo repetitivo no contexto.
4. **Contexto pode conter chunks de múltiplos documentos sem distinção clara**: a fonte é citada no cabeçalho de cada chunk, mas o LLM pode confundir ou combinar trechos.
5. **Não há validação de alinhamento resposta-fonte**: o sistema não verifica se citações na resposta correspondem aos chunks fornecidos.
6. **Prompt injection em documentos**: um documento aprovado malicioso pode conter instruções. A função `escapeContextDelimiters` e `sanitizePromptInput` reduzem, mas não eliminam, o risco.
7. **Abstinência depende de frase exata**: `askRag` não retorna flag estruturada de abstinência; detecta-se apenas pela presença da frase "não contém informações suficientes".
8. **Latência não rastreada no cliente**: a métrica `latencyMs` é logada, mas o usuário não sabe se a resposta veio do primário ou fallback.
9. **Busca OR pode trazer ruído**: migração 052 usa OR entre palavras-chave; perguntas amplas podem recuperar documentos irrelevantes.
10. **Sem testes automatizados de qualidade RAG**: não há baseline medido contra dataset conhecido.

## 6. Métricas Propostas

| Métrica | Definição | Como medir |
|---|---|---|
| `retrieval_success_rate` | % de consultas que retornam ao menos 1 chunk | contar `results.length > 0` |
| `empty_retrieval_rate` | % de consultas sem resultados | contar `results.length === 0` |
| `top_k_relevance` | % em que o chunk esperado está no top-3 | avaliação manual/sintética |
| `approved_only_rate` | % de buscas em que todos os resultados são `aprovado` | verificar `status` (deve ser 100%) |
| `duplicate_chunk_rate` | % de chunks repetidos no top resultados | comparar `content` dos chunks |
| `abstention_rate` | % de respostas que usam a frase de abstinência | `answer.toLowerCase().includes(ABSTENTION_PHRASE)` |
| `unsupported_answer_rate` | % de respostas que afirmam fatos não presentes nos chunks | avaliação manual/sintética |
| `source_alignment_rate` | % de respostas com citações consistentes com `sources` | avaliação manual/sintética |
| `prompt_injection_rejection` | % de testes com documento malicioso que não alteram instruções | testes com injection documental |
| `latency_ms` | tempo de ida e volta | `Date.now() - start` |
| `provider_error_rate` | % de consultas com erro do Gemini | `RAG_QUERY_ERROR` / total |

> Nenhuma métrica exige alteração de schema nesta fase. Elas podem ser coletadas a partir dos logs e testes offline.

## 7. Dataset Sintético

Ver `__tests__/rag/evaluation-dataset.json` e `__tests__/rag/rag-evaluation.test.js`.

O dataset contém 9 documentos fictícios (6 aprovados, 1 rascunho, 1 irrelevante, 1 com prompt injection simulado) e 14 perguntas, sem PII, usados para medir o pipeline sem conexão com banco de produção.

## 8. Resultados da Avaliação Offline

Execução com mocks do pipeline de recuperação (sem Gemini e sem Supabase):

| Métrica | Valor |
|---|---|---|
| `retrieval_success_rate` | 92,86% (13/14 retornam ao menos 1 chunk) |
| `empty_retrieval_rate` | 7,14% (1/14 sem resultados) |
| `top_k_relevance` (top-3) | 100% (12/12 respondíveis com documento esperado no top-3) |
| `top_1_relevance` | 100% (12/12 respondíveis com documento esperado em primeiro) |
| `approved_only_rate` | 100% (nenhum documento `rascunho` foi recuperado) |
| `out_of_domain_empty_rate` | 50% (apenas 1/2 perguntas fora da base retornou vazio) |

### Observações

- Aprovados: o documento `rascunho` nunca apareceu nos resultados, confirmando o filtro de status.
- Relevância: para perguntas respondíveis, o documento esperado foi sempre encontrado no top-3 e, na maioria, em primeiro. A simulação FTS com OR favoreceu correspondências de termos exatos.
- Fora de domínio: a pergunta `direito empresarial e reestruturação societária` retornou documentos irrelevantes porque termos como `direito` aparecem em múltiplos documentos. Isso confirma o risco de ruído da busca OR sem limiar de score mínimo.
- Prompt injection: o documento malicioso aparece para a query `propriedade intelectual`; o conteúdo com `ignore previous instructions` é neutralizado por `sanitizePromptInput` e `escapeContextDelimiters`, desde que o delimitador de contexto seja respeitado.
- Limitações: a avaliação foi feita com simulação do FTS e sem chamada ao Gemini; os resultados de `abstention_rate`, `unsupported_answer_rate`, `source_alignment_rate` e `latency_ms` dependem de execução do `askRag` e devem ser medidos em fase posterior.

## 9. Próximos Passos Recomendados

1. Executar avaliação offline regularmente com o dataset sintético.
2. Adicionar testes de regressão para `searchKnowledge` com mocks da função SQL.
3. Considerar expansão de sinônimos na query antes do FTS.
4. Avaliar `pgvector`/embeddings se o volume de documentos crescer.
5. Implementar verificação de alinhamento resposta-fonte (pós-geração).
6. Refinar a lista de padrões de prompt injection em `lib/aiRag.js`.

## 10. Arquivos Criados/Alterados

### Criados
- `__tests__/rag/evaluation-dataset.json`
- `__tests__/rag/rag-evaluation.test.js`

### Alterados
- `lib/aiRag.js`: `sanitizePromptInput` agora é exportada para permitir teste de sanitização (sem alteração no comportamento produtivo).
- `docs/rag-evaluation-baseline.md`: inclusão de dataset, metodologia e resultados.

## 11. Arquivos Não Alterados

- `lib/knowledgeSearch.js` (lógica de busca intacta)
- `pages/api/ai/ask.js` (endpoint intacto)
- `supabase/migrations/050_*.sql`, `051_*.sql`, `052_*.sql` (schema intacto)
- Modelos e prompts ativos do bot (`lib/ai.js`, `lib/bot-responses.js`)

> `lib/aiRag.js` teve apenas a exportação de `sanitizePromptInput` adicionada para testes; o prompt produtivo e a lógica de sanitização permanecem inalterados.

## 12. Riscos Remanescentes

1. Busca OR sem limiar de score pode trazer contexto irrelevante para perguntas amplas.
2. Chunks sobrepostos podem inflar o contexto sem agregar diversidade.
3. `source_alignment` não pode ser validada sem executar `askRag` com o Gemini.
4. `abstention_rate` depende de avaliação da resposta gerada, não medida nesta fase.
5. A simulação offline não reproduz o FTS do PostgreSQL; resultados podem diferir em produção.

## 13. Recomendação do Próximo Passo

Aprovar ou rejeitar mudanças no RAG com base neste baseline. A primeira melhoria de baixo risco é adicionar um score threshold mínimo na `search_knowledge` para reduzir resultados irrelevantes em consultas amplas, sem alterar o modelo nem o prompt.
