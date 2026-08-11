# Central de Conhecimento - Case Insights

## 📚 O que foi implementado

### 1. **Banco de Dados (Migration 026)**

#### Tabela `case_insights`
```sql
id, case_id, conversation_id, legal_area, case_type, municipality, agency, client_role,
summary, strategy_notes, risk_notes, outcome_notes, similar_patterns,
created_by_user_id, created_at, updated_at, source, confidential, confidential_reason
```

**Campos principais:**
- `case_id` - Referência ao caso (opcional)
- `conversation_id` - Referência à conversa (obrigatório)
- `legal_area`, `case_type`, `municipality`, `agency`, `client_role` - Classificação
- `summary` - Visão geral do caso e problema principal
- `strategy_notes` - Principais estratégias usadas ou recomendadas
- `risk_notes` - Riscos jurídicos/probatórios observados
- `outcome_notes` - Resultado do caso e lições aprendidas
- `similar_patterns` - Padrões recorrentes observados
- `source` - 'manual' ou 'ai_assisted'
- `confidential` - Se true, apenas admin/advogado podem ver

#### Tabela `insight_usage`
```sql
id, insight_id, conversation_id, user_id, action (view|apply|reference), created_at
```
- Rastreia quando insights são consultados ou aplicados
- Permite medir reutilização

#### View `similar_insights`
- Lista insights similares não confidenciais
- Ordenados por data e uso

#### Função `find_similar_insights()`
```sql
find_similar_insights(legal_area, case_type, municipality, agency, client_role, limit)
```
- Encontra insights similares com score de match
- Pontuação: legal_area (2), case_type (2), municipality (1), agency (1), client_role (1)

---

### 2. **IA para Geração de Insights**

#### Função `generateInsightWithAI()`
- Usa Gemini API para gerar insights estruturados
- Coleta dados da conversa: legal_area, case_summary, intake_data
- Gera proposta com 5 campos (summary, strategy, risk, outcome, patterns)
- Fallback: extrai JSON da resposta ou usa valores padrão

---

### 3. **APIs**

#### GET /api/insights
Lista insights com filtros:
```bash
GET /api/insights?legal_area=Trabalhista&case_type=Licença&search=termo
```

#### GET /api/insights?id=<id>
Retorna insight específico e registra visualização

#### GET /api/insights?action=generate_proposal&conversation_id=<id>
Gera proposta de insight usando IA:
```json
{
  "legal_area": "Direito Trabalhista",
  "case_type": "Licença Prêmio",
  "municipality": "Campo Largo",
  "agency": "Prefeitura",
  "client_role": "Servidor Efetivo",
  "summary": "Caso de servidor que solicitou licença prêmio...",
  "strategy_notes": "Estratégias recomendadas...",
  "risk_notes": "Riscos observados...",
  "outcome_notes": "Resultado do caso...",
  "similar_patterns": "Padrões recorrentes...",
  "source": "ai_assisted"
}
```

#### GET /api/insights?action=similar&conversation_id=<id>
Busca insights similares para uma conversa:
```json
[
  {
    "insight_id": "uuid",
    "legal_area": "Direito Trabalhista",
    "case_type": "Licença Prêmio",
    "summary": "...",
    "match_score": 5
  }
]
```

#### POST /api/insights
Cria novo insight:
```json
{
  "action": "create",
  "conversation_id": "uuid",
  "case_id": "uuid",
  "legal_area": "Direito Trabalhista",
  "case_type": "Licença Prêmio",
  "municipality": "Campo Largo",
  "agency": "Prefeitura",
  "client_role": "Servidor Efetivo",
  "summary": "...",
  "strategy_notes": "...",
  "risk_notes": "...",
  "outcome_notes": "...",
  "similar_patterns": "...",
  "created_by_user_id": "uuid",
  "source": "manual",
  "confidential": false
}
```

#### PATCH /api/insights?id=<id>
Atualiza insight

#### DELETE /api/insights?id=<id>
Deleta insight

---

### 4. **Componente React**

#### CaseInsightsPanel
Painel com 4 abas (botões exclusivos):

**1. 📋 Insights**
- Lista todos os insights
- Filtros por legal_area, case_type, search
- Clique para ver detalhes em modal

**2. 🔗 Similares**
- Mostra insights similares para a conversa atual
- Score de match (0-5)
- Destacado em verde

**3. ✨ Criar Insight**
- Gerar proposta com IA ou criar manualmente
- Editar campos antes de salvar
- Salvar com source='ai_assisted' ou 'manual'

**4. Detalhes (Modal)**
- Visualização completa do insight
- Todos os 5 campos
- Data de criação

---

## 🎯 Fluxo de Uso

### 1. Encerrar Caso e Gerar Insight

```
1. Conversa/caso chega em status = 'encerrado'
2. Sistema sugere: "Gerar insight do caso?"
3. Clica em "✨ Criar Insight"
4. Sistema chama IA para gerar proposta
5. Você revisa e edita se necessário
6. Clica "💾 Salvar Insight"
7. Insight é salvo com source='ai_assisted'
```

### 2. Consultar Insights

```
1. Painel → Central de Conhecimento
2. Aba "📋 Insights"
3. Filtrar por área, tipo, buscar por texto
4. Clique para ver detalhes
```

### 3. Usar Insights em Novo Caso

```
1. Novo caso com legal_area, case_type, municipality similares
2. Painel → Central de Conhecimento
3. Aba "🔗 Similares"
4. Sistema mostra insights similares automaticamente
5. Clique para ver estratégias, riscos, padrões
6. Aplique aprendizados ao novo caso
```

### 4. Criar Insight Manualmente

```
1. Painel → Central de Conhecimento
2. Aba "✨ Criar Insight"
3. Preencher campos manualmente
4. Salvar com source='manual'
```

---

## 🔐 Segurança

### Confidencialidade
- Se conversa original é `confidential = true`
- Insight herda `confidential = true`
- Apenas admin/advogado podem ver

### Auditoria
- Toda criação/edição registra audit_log
- Rastreia quem criou, quando e o quê

### Rastreamento de Uso
- Cada visualização registra em insight_usage
- Permite medir reutilização de insights

---

## 📊 Exemplos de Insights

### Exemplo 1: Licença Prêmio
```
Legal Area: Direito Trabalhista
Case Type: Licença Prêmio
Municipality: Campo Largo
Agency: Prefeitura

Summary: Servidor público que solicitou licença prêmio não concedida pela administração.

Strategy Notes: 
1. Verificar se servidor completou 5 anos de serviço efetivo
2. Preparar mandado de segurança se negativa administrativa
3. Coletar documentação de tempo de serviço

Risk Notes:
- Risco de prescrição se não agir em 2 anos
- Necessário comprovar tempo de serviço efetivo
- Pode haver resistência da administração

Outcome Notes:
Caso ganho em primeira instância. Servidor recebeu licença prêmio com retroatividade.

Similar Patterns:
Muitos servidores da Prefeitura de Campo Largo com mesmo problema. 
Padrão de negativa administrativa injustificada.
```

### Exemplo 2: Indenização por Dano Moral
```
Legal Area: Direito do Consumidor
Case Type: Indenização
Municipality: Itabuna
Agency: Empresa Privada

Summary: Cliente sofreu dano moral por cobrança indevida de empresa de telecomunicações.

Strategy Notes:
1. Documentar todas as tentativas de cobrança
2. Coletar comprovantes de pagamento
3. Solicitar extrato de débito na empresa

Risk Notes:
- Empresa pode alegar erro administrativo
- Valor de indenização pode ser reduzido
- Necessário comprovar dano efetivo

Outcome Notes:
Acordo extrajudicial com indenização de R$ 5.000.

Similar Patterns:
Padrão recorrente com esta empresa de telecomunicações.
Muitos clientes com cobranças indevidas similares.
```

---

## 🔮 Próximos Passos

1. **Dashboard de Insights**
   - Gráficos de insights por área/tipo
   - Insights mais reutilizados
   - Taxa de aplicação

2. **Busca Semântica**
   - Buscar por similaridade de conteúdo (não só filtros)
   - Usar embeddings para encontrar insights relacionados

3. **Sugestões Automáticas**
   - Quando novo caso é criado, sugerir insights similares automaticamente
   - Notificação: "Encontramos X insights similares"

4. **Versionamento**
   - Histórico de versões de insights
   - Rastrear mudanças ao longo do tempo

5. **Exportação**
   - Exportar insights como PDF/Word
   - Gerar relatório de aprendizados por período

6. **Integração com Templates**
   - Usar insights para sugerir templates de documentos
   - Exemplo: "Para este caso, recomendamos estes templates"

---

## 📝 Campos de Insight Explicados

| Campo | Descrição | Exemplo |
|-------|-----------|---------|
| **summary** | Visão geral concisa do caso | "Servidor que solicitou licença prêmio não concedida" |
| **strategy_notes** | Estratégias usadas ou recomendadas | "Preparar mandado de segurança, verificar tempo de serviço" |
| **risk_notes** | Riscos jurídicos/probatórios | "Risco de prescrição em 2 anos, necessário comprovar tempo" |
| **outcome_notes** | Resultado e lições aprendidas | "Caso ganho, servidor recebeu licença com retroatividade" |
| **similar_patterns** | Padrões recorrentes | "Muitos servidores desta prefeitura com mesmo problema" |

---

## ⚙️ Configuração

### Variáveis de Ambiente
```
GOOGLE_AI_API_KEY=sua_chave_gemini
NEXT_PUBLIC_SUPABASE_URL=sua_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service
```

### Limites
- Máximo 50 insights por página
- Máximo 5 insights similares por busca
- Timeout de 12s para geração de IA

---

**Última atualização:** 2024-08-11  
**Status:** ✅ Implementado e pronto para uso  
**Deploy:** https://backend-apimeta.vercel.app
