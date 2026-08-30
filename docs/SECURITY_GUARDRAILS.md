# Guardrails de Segurança e Separação de Responsabilidades

## Finalidade

Este documento registra as razões pelas quais certos arquivos e funções com nomes semelhantes **não devem ser consolidados automaticamente**. A separação protege contra:

- Exposição de PII (dados pessoais) em logs, notificações ou rotas.
- Falhas de autorização por mistura de contextos de autenticação.
- URLs inseguras ou redirecionamentos maliciosos.
- Regressão de cobertura de testes.
- Perda de rastreabilidade de operações críticas.

Consolidações inadequadas podem comprometer a segurança, conformidade LGPD e estabilidade operacional.

---

## Funções que devem permanecer separadas

| Área | Função/Arquivo | Finalidade | Não consolidar com | Risco se consolidar |
|---|---|---|---|---|
| **Logging** | `lib/safeLogger.js` `sanitizeForLog` | Remover PII/segredos de strings antes de registrar em console/observabilidade | `notificationHelpers.validateNoPII`, `anonymize.anonymizeText` | Expor dados sensíveis em logs; confundir contexto de log com contexto de UI |
| **Logging** | `lib/safeLogger.js` `safeLog`, `safeError` | Registrar eventos estruturados sem expor detalhes internos | Funções de UI ou roteamento | Expor stack trace, SQL ou detalhes de erro em logs públicos |
| **Logging** | `lib/safeLogger.js` mascaramento (telefone, CPF/CNPJ, e-mail, token, URL, storage_path) | Mascarar valores sensíveis em logs mantendo rastreabilidade | Validação de notificações ou rotas | Mascarar dados que deveriam ser rejeitados, não apenas ocultados |
| **Anonimização RAG** | `lib/anonymize.js` `anonymizeText` | Reduzir dados pessoais em conteúdo antes de indexar em base de conhecimento | Sanitização de logs ou validação de UI | Usar anonimização de conteúdo como substituto de revisão humana; perder rastreamento de dados sensíveis |
| **Notificações** | `lib/notificationHelpers.js` `sanitizeNotificationTitle` | Gerar títulos seguros de notificações removendo PII de dados brutos | `validateNoPII` (ordem de operação) | Permitir títulos com PII; confundir geração com validação |
| **Notificações** | `lib/notificationHelpers.js` `validateNoPII` | Validar se um título já gerado é seguro para exibir | `sanitizeNotificationTitle` (ordem de operação) | Permitir títulos inseguros; falha de validação em camada errada |
| **Notificações** | `lib/notificationHelpers.js` `validateInternalNotificationRoute` | Validar se uma rota interna é segura (sem PII, tokens, redirecionamentos) | `lib/router.js` `buildInternalUrl` (separação de validação e construção) | Permitir URLs maliciosas; XSS ou redirecionamento para site externo |
| **Roteamento** | `lib/notificationHelpers.js` `getNotificationRoute` | Gerar rota segura específica para notificação (wrapper de `buildInternalUrl`) | `lib/router.js` `buildInternalUrl` (especialização legítima) | Perder contexto de notificação; confundir rotas genéricas com rotas de notificação |
| **Roteamento** | `lib/router.js` `buildInternalUrl` | Construir URLs internas padronizadas com query strings | Validação de rota ou sanitização de log | Construir URLs inseguras; confundir construção com validação |
| **Agregação** | `lib/notificationAggregator.js` | Selecionar, filtrar, deduplica e contar notificações autorizadas por usuário/papel | Cache, autenticação ou UI | Misturar dados de usuários; perder filtro de autorização |
| **Cache** | `lib/notificationCache.js` | Cache LRU com TTL isolado por usuário/papel | Agregação ou autenticação | Vazar dados entre usuários; cache sem isolamento de permissões |
| **Estado React** | `NotificationProvider.js` | Gerenciar estado, polling, retry, cooldown e coordenação de requests | Componentes visuais (Bell, Panel, Item) | Divergência entre badge e painel; race conditions em polling |
| **Autenticação** | APIs de notificações (`pages/api/notifications.js`, `pages/api/notifications/count.js`) | Usar `withAuth` e `req.user` para autenticação; nunca confiar em headers manipuláveis | Headers como `x-user-id` ou `x-user-role` | Permitir acesso não autorizado; escalação de privilégio |
| **APIs Legado vs Moderna** | `pages/api/documents.js` vs `pages/api/templates.js` | Registrar como APIs com fontes e contratos potencialmente distintos | Consolidação sem auditoria | Remover API legada sem migração; quebrar consumidores; perder cobertura de testes |

---

## Regras de alteração futura

Antes de qualquer consolidação ou refatoração, seguir estas regras:

### 1. Diagnóstico obrigatório

- Mapear todas as referências e consumidores do arquivo/função.
- Comparar entradas, saídas, efeitos colaterais, contexto (client/server), cache, logs e autorização.
- Verificar se há testes unitários, de integração, de API e de segurança.
- Confirmar se há documentação ou comentários explicando a separação.

### 2. Classificação de risco

- **Baixo risco:** Funções puras sem efeitos colaterais, bem testadas, consumidores conhecidos.
- **Risco médio:** Funções com cache, logs ou autorização; múltiplos consumidores.
- **Alto risco:** Funções de segurança (autenticação, validação, sanitização); APIs com contrato público.

### 3. Preservação de contrato

- Nenhuma consolidação pode reduzir controles de PII, validação de URL, autenticação ou permissões.
- Testes devem preservar comportamento antigo e novo.
- Migração deve ser incremental, em branch isolado.

### 4. Testes de regressão

- Não remover teste só porque existe teste parecido.
- Diferenciar testes unitários, de API, de integração e de segurança.
- Executar `npm test`, `npm run lint`, `npm run build`, `npm run check-secrets` antes de commit.

### 5. Segurança em resposta e erro

- Nunca usar resposta/erro bruto de serviço externo na interface ou log.
- Sanitizar erros de banco de dados antes de registrar.
- Validar URLs antes de redirecionar.

### 6. Preferência por especialização

- Preferir funções pequenas e especializadas quando o contexto de segurança for diferente.
- Usar wrappers (como `getNotificationRoute` sobre `buildInternalUrl`) em vez de consolidação.

### 7. Histórico de banco

- Migrations históricas nunca devem ser editadas ou removidas para "limpeza".
- Criar nova migration se for necessário alterar schema.

### 8. Separação client/server

- Não consolidar código de client/browser com código server-side se isso puder expor segredo.
- Manter helpers de log, sanitização e validação no servidor.

### 9. Validação completa

- Alterações devem respeitar `npm test`, lint, build, `check-secrets`, `git diff --check`.
- Revisar permissões de RLS se houver mudança em banco.
- Testar em ambiente de staging antes de produção.

---

## Processo seguro para futuras consolidações

Se uma consolidação for aprovada após diagnóstico, seguir este fluxo:

### 1. Planejamento

- Criar issue com diagnóstico, risco, consumidores e plano de migração.
- Obter aprovação de code review e segurança.

### 2. Desenvolvimento

- Criar branch isolado (`feature/consolidate-xxx`).
- Implementar mudança em commit isolado.
- Adicionar testes que preservem contrato antigo e novo.

### 3. Validação

- Executar suite completa de testes.
- Verificar cobertura de código.
- Executar `npm run check-secrets` para confirmar que nenhum segredo foi exposto.
- Executar `git diff --check` para confirmar que não há whitespace inválido.

### 4. Migração incremental

- Se houver consumidores múltiplos, migrar um por um.
- Manter compatibilidade com API antiga durante transição.
- Registrar mudanças em changelog.

### 5. Rollback

- Usar `git revert <commit>` para desfazer, sem comandos destrutivos.
- Testar rollback em staging antes de produção.

### 6. Monitoramento

- Após deploy, monitorar logs e métricas.
- Não expor PII em alertas ou dashboards.
- Estar pronto para rollback rápido se houver regressão.

---

## Situação atual (Auditoria Fase 1)

A auditoria de duplicidades e reuso de código (Fase 1) concluiu:

- **Nenhuma duplicidade provável** foi identificada que justifique consolidação imediata.
- A maioria das relações é **complementar** (ex: `buildInternalUrl` + `validateInternalNotificationRoute`) ou apenas **nomes semelhantes** (ex: `maskPhone` vs `validateNoPII`).
- **Nenhum teste está claramente duplicado.** Todos cobrem cenários ou módulos distintos.
- As separações entre sanitização de logs, anonimização RAG, validação de PII, validação de URL e construção de rota são **intencionais e devem ser preservadas.**

### Recomendações

- **Nenhuma ação imediata.** A estrutura atual é segura e bem separada por responsabilidade.
- **Prioridade:** Estabilidade e uso operacional, não redução artificial de arquivos.
- **Consolidação de `documents.js` e `templates.js`:** Exige auditoria dedicada (risco médio), não deve ser considerada baixo risco. São APIs com fontes e contratos diferentes; `documents.js` usa templates em memória; `templates.js` usa Supabase. Sem cobertura suficiente de testes, remoção/migração é arriscada.

---

## Referências

- [Auditoria de Duplicidades e Reuso de Código](../IMPLEMENTATION_26_AUDIT_REPORT.md) (se disponível)
- [Guia de Segurança LGPD](./COLLABORATION_LGPD_GUIDE.md)
- [Auditoria de Segurança](./SECURITY_AUDIT.md)
- [Checklist de Aceite Operacional](./operational-acceptance-checklist.md)

---

**Última atualização:** Agosto de 2026  
**Responsável:** Equipe de Desenvolvimento  
**Próxima revisão:** Após próxima auditoria de código ou consolidação aprovada
