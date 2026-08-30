# Scripts SQL Históricos

- Estes arquivos são scripts históricos/ad-hoc mantidos apenas para referência e rastreabilidade.
- Eles não são migrations ativas.
- Eles não devem ser executados automaticamente, em produção ou desenvolvimento, sem revisão técnica e aprovação explícita.
- O schema canônico do projeto está em `supabase/migrations/`.
- Para mudanças de banco futuras, criar novas migrations; nunca editar migrations históricas já aplicadas.
- Alguns scripts podem ter sido usados para suporte, correção pontual, bootstrap ou diagnóstico em versões anteriores.
- Não incluir em comandos de setup, CI/CD ou deploy.
- Não contém instrução operacional para executar os scripts.
- Não adicionar dados reais, credenciais, tokens ou conteúdo de produção.
- Em caso de necessidade de recuperação, revisar o script, o histórico Git e o estado atual do banco antes de qualquer execução.

| Arquivo | Classificação | Motivo do arquivamento | Pode ser executado automaticamente? |
|---|---|---|---|
| CREATE_DOCUMENTS_AND_INSIGHTS_TABLES.sql | Histórico/ad-hoc | Fora de migrations; sem referência ativa confirmada | Não |
| EXECUTE_MIGRATION_032.sql | Histórico/ad-hoc | Script de execução pontual fora do fluxo de migrations | Não |
| FIX_ADMIN_USER.sql | Histórico/ad-hoc | Correção pontual; sem referência ativa confirmada | Não |
| REMOVE_AUDIT_TRIGGER.sql | Histórico/ad-hoc | Script de remoção pontual fora de migrations | Não |
| SUPABASE_SETUP.sql | Histórico/ad-hoc | Setup bootstrap; schema atual é mantido por migrations | Não |
| SUPABASE_SETUP_FINAL.sql | Histórico/ad-hoc | Variante de setup bootstrap; duplicado/legado | Não |
| SUPABASE_SETUP_SIMPLE.sql | Histórico/ad-hoc | Variante de setup bootstrap; duplicado/legado | Não |
| fix-message-status.sql | Histórico/ad-hoc | Correção pontual; sem referência ativa confirmada | Não |
