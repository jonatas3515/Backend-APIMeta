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
|---|---|---|---|---|---|---|---|
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

O dataset contém 9 documentos fictícios (6 aprovados, 1 rascunho, 1 irrelevante, 1 com prompt injection simulado) e 19 perguntas, sem PII, incluindo casos de regressão para consultas curtas, linguagem leiga, amplas respondíveis, fora do domínio e sem resposta.

## 8. Resultados da Avaliação Offline

Execução com mocks do pipeline de recuperação (sem Gemini e sem Supabase):

### 8.1 Tabela de calibração de limiares

| minRank | retrieval_success_rate | empty_retrieval_rate | top_1_relevance | top_k_relevance | approved_only_rate | out_of_domain_noise_rate | falsos_vazios_respondíveis | resultados_irrelevantes_mantidos | chunks_recuperados |
|---|---|---|---|---|---|---|---|---|---|
| 0,00 | 84,21% | 15,79% | 93,75% | 93,75% | 100% | 33,33% | 1 | 2 | 21 |
| 0,05 | 84,21% | 15,79% | 93,75% | 93,75% | 100% | 33,33% | 1 | 2 | 21 |
| 0,10 | 84,21% | 15,79% | 93,75% | 93,75% | 100% | 33,33% | 1 | 2 | 21 |
| 0,15 | 84,21% | 15,79% | 93,75% | 93,75% | 100% | 33,33% | 1 | 2 | 21 |
| 0,20 | 84,21% | 15,79% | 93,75% | 93,75% | 100% | 33,33% | 1 | 2 | 21 |
| 0,25 | 84,21% | 15,79% | 93,75% | 93,75% | 100% | 33,33% | 1 | 2 | 21 |
| 0,30 | 78,95% | 21,05% | 93,75% | 93,75% | 100% | 0% | 1 | 0 | 18 |

### 8.2 Perguntas afetadas

- `q8 - direito empresarial e reestruturação societária` (out_of_domain): recuperou 2 chunks irrelevantes até `0.25`; ficou vazia a partir de `0.30`.
- `q4 - defesa contra lançamento tributário` (answerable): recuperou 3 chunks no baseline; com `0.30` caiu para 2, removendo o chunk de prompt-injection `doc-injection` (score 0.25).
- `q14 - rescisão indireta e consumidor cobrado indevidamente` (multi_area): manteve 2 resultados em todos os limiares (top-1 0.60, top-2 0.40).
- `q15 - CLT` (short_query): manteve top-1 em todos os limiares (score 1.0).
- `q16 - fui demitido sem receber e quero processar` (lay_language): manteve vazio em todos os limiares — problema lexical/sinônimo, não de limiar.
- `q18 - período de férias no contrato de trabalho` (no_answer): manteve vazio em todos os limiares — abstinência correta.

### 8.3 Limitação fundamental dos mocks

O score usado nos mocks é a **proporção de tokens da query encontrados no chunk** após remoção de stopwords e normalização. Isso **não é equivalente** a `ts_rank_cd` do PostgreSQL, que leva em conta:

- densidade de ocorrências;
- normalização pelo comprimento do documento;
- peso do tsvector (`A`, `B`, `C`, `D`);
- distância entre os termos na query `tsquery`.

Portanto, os números desta tabela mostram comportamento **relativo apenas ao dataset sintético**. Não permitem calibrar um `minRank` produtivo com segurança. O fato de nenhum limiar entre `0` e `0.25` alterar o resultado indica que não há consultas com scores intermediários no dataset, e não que todos os valores sejam iguais em produção.

### 8.4 Observações

- Aprovados: o documento `rascunho` nunca apareceu em nenhum cenário.
- Ruído fora de domínio só desaparece em `0.30` no mock, porque o score do ruído é exatamente `0.25`.
- Prompt injection: o documento malicioso continua aparecendo para a query sobre `propriedade intelectual` enquanto for relevante; o conteúdo com `ignore previous instructions` é neutralizado por `sanitizePromptInput` e `escapeContextDelimiters`.
- `abstention_rate`, `unsupported_answer_rate` e `source_alignment` ainda não puderam ser medidos.

## 9. Implementação do Filtro de Relevância

### 9.1 Causa técnica do ruído

A função SQL `search_knowledge` (migração 052) usa `to_tsquery` com operador OR entre todas as palavras-chave. Isso evita que perguntas longas sejam descartadas por ausência de um único termo, mas permite que termos genéricos (como `direito`) encontrem documentos com correspondência fraca. O `ts_rank_cd` é calculado e retornado na coluna `rank`, mas até esta tarefa o cliente JavaScript não aplicava nenhum corte mínimo.

### 9.2 Estratégia escolhida

- Nenhuma migration nem alteração de schema.
- Nenhuma alteração na função SQL nem no prompt.
- `lib/knowledgeSearch.js` passa a aceitar `minRank` e filtrar chunks com `r.rank < minRank` antes do `slice(0, limit)`.
- `lib/knowledge-embeddings.js` recebe o mesmo parâmetro e aplica o mesmo filtro.
- O padrão é `minRank = 0`, ou seja, o filtro está desligado por padrão. O endpoint principal pode passar `minRank` via variável de ambiente se desejado.

### 9.3 Valor do limiar

O valor `0.30` eliminou o ruído no dataset sintético, mas **não está calibrado para o `ts_rank_cd` real do PostgreSQL**. Os limiares intermediários (`0.05` a `0.25`) não apresentam efeito no mock porque o dataset não gera scores nessa faixa.

## 10. Arquivos Criados/Alterados

### Criados
- `__tests__/rag/evaluation-dataset.json` (atualizado com 19 perguntas, incluindo regressão)
- `__tests__/rag/rag-evaluation.test.js` (baseline + calibração + comparação com threshold)

### Alterados
- `lib/aiRag.js`: `sanitizePromptInput` exportada para testes (sem alteração no comportamento produtivo).
- `lib/knowledgeSearch.js`: aceita e aplica `minRank` no corte de resultados.
- `lib/knowledge-embeddings.js`: aceita e aplica `minRank` no corte de resultados.
- `docs/rag-evaluation-baseline.md`: comparação de baseline e análise do filtro.

## 11. Arquivos Não Alterados

- `pages/api/ai/ask.js` (endpoint intacto; não foi alterado para passar `minRank`)
- `supabase/migrations/050_*.sql`, `051_*.sql`, `052_*.sql` (schema intacto)
- Modelos e prompts ativos do bot (`lib/ai.js`, `lib/bot-responses.js`)

## 12. Riscos Remanescentes

1. **Incompatibilidade de escala**: o score do mock não representa `ts_rank_cd`. Qualquer valor de `minRank` ativado em produção é um palpite até medição real.
2. Consultas em linguagem leiga ou com sinônimos ainda podem retornar vazio (ex.: `fui demitido sem receber`).
3. Chunks sobrepostos podem inflar o contexto sem agregar diversidade.
4. `source_alignment` e `abstention_rate` ainda não podem ser validados sem executar `askRag` com o Gemini.
5. A simulação offline não reproduz o FTS do PostgreSQL; resultados podem diferir em produção.

## 13. Recomendação Expressa

**Recomendação: manter `minRank = 0` (desligado) e medir o `ts_rank_cd` real antes de ativar.**

O código do filtro está implementado e testado offline, mas a avaliação não fornece uma calibração segura para produção. Antes de criar qualquer variável de ambiente:
1. Coletar os valores reais de `rank` de um conjunto representativo de consultas no PostgreSQL.
2. Construir um histograma de `ts_rank_cd` para consultas respondíveis, fora de domínio e ambíguas.
3. Só então escolher um `minRank` com base em dados reais, iniciando com valor baixo e subindo gradualmente.

Não ativar `RAG_MIN_RANK` apenas com base no dataset sintético.

## 14. Plano de Medição Controlada do `ts_rank_cd` Real

### 14.1 Fonte das amostras

A fonte planejada é a função `search_knowledge` do PostgreSQL, executada contra o banco real com um conjunto de **queries sintéticas e não sensíveis**. Nenhum texto de pergunta real, chunk ou documento será coletado.

### 14.2 Script preparado

`scripts/rag-rank-sampler.js` está pronto para execução manual. Ele:

- executa `search_knowledge` em modo somente leitura;
- usa 15 queries fictícias categorizadas;
- não registra o texto original das queries (apenas `sha256` truncado);
- não registra `content`, `title`, `document_id` nem `chunk_id`;
- coleta apenas estatísticas agregadas: mínimo, máximo, percentis e contagens por categoria;
- produz um JSON sanitizado no console.

### 14.3 O que não foi executado

A execução em ambiente real depende de acesso ao Supabase com `SUPABASE_SERVICE_ROLE_KEY` e `NEXT_PUBLIC_SUPABASE_URL`. Esta tarefa **não executou** o sampler em Production nem em qualquer ambiente real por falta de confirmação de acesso seguro. O script foi criado e validado estaticamente.

### 14.4 Próximos passos para medição real

1. Executar `node scripts/rag-rank-sampler.js` em ambiente controlado (staging ou produção, somente leitura).
2. Coletar pelo menos 50–100 consultas por categoria para estabilidade estatística.
3. Comparar as distribuições de `ts_rank_cd` entre respondíveis, fora do domínio, ambíguas e linguagem leiga.
4. Escolher um `minRank` que separe claramente as categorias, se existir.
5. Se houver grande sobreposição, priorizar melhorias de sinônimos, embeddings ou reescrita da query antes de ativar o filtro.