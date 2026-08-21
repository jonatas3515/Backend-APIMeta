# 🧪 Guia de Testes - Backend API Meta

## Visão Geral

Este projeto utiliza **Jest** como framework de testes para proteger fluxos críticos sem chamar serviços externos reais.

## Configuração

### Instalação de Dependências

```bash
npm install
```

### Variáveis de Ambiente

Copie o arquivo de exemplo:

```bash
cp .env.test.example .env.test
```

**IMPORTANTE:** O arquivo `.env.test` está no `.gitignore` e **NUNCA** deve conter credenciais reais. Os testes usam mocks e não dependem de valores reais.

## Executando Testes

### Todos os Testes com Cobertura

```bash
npm run test
```

### Modo Watch (Desenvolvimento)

```bash
npm run test:watch
```

### CI/CD

```bash
npm run test:ci
```

## Estrutura de Testes

```
__tests__/
├── api/
│   ├── auth.test.js          # Autenticação e permissões
│   ├── webhook.test.js        # Webhook WhatsApp e LGPD
│   ├── rag.test.js            # RAG e busca de conhecimento
│   ├── datajud.test.js        # Integração DataJud
│   └── triage.test.js         # Triagem processual
├── fixtures/
│   ├── synthetic-data.js      # Dados sintéticos para testes
│   └── payloads.js            # Payloads de webhook sintéticos
└── mocks/
    └── supabase.js            # Mock do Supabase client
```

## Cobertura de Testes

### Autenticação e Permissões (5 testes)

✅ Endpoint sem token retorna 401  
✅ Token inválido retorna 401  
✅ Estagiário não acessa rota de advogado (403)  
✅ Advogado acessa rota permitida (200)  
✅ Logs não contêm email, token ou Authorization  

### Webhook e LGPD (5 testes)

✅ Payload com "1" registra aceite  
✅ Payload com "ACEITO" registra aceite  
✅ Payload com "2" registra recusa  
✅ Payload com "REVOGO" registra revogação  
✅ Logs não contêm telefone, nome, CPF, email, token ou body completo  

### RAG (4 testes)

✅ Sem fonte aprovada: não chama Gemini  
✅ Com fonte aprovada: chama Gemini mockada  
✅ Documento rascunho não aparece na busca  
✅ Logs não contêm chunk integral, resposta Gemini ou PII  

### DataJud (5 testes)

✅ Tribunal não cadastrado é rejeitado  
✅ Erro 401 retornado como erro explícito  
✅ Erro 403 retornado como erro explícito  
✅ Timeout retornado como erro explícito  
✅ Frontend não recebe alias, URL, header ou chave  

### Triagem Processual (5 testes)

✅ Sugestão automática não altera status  
✅ PATCH sincroniza review_status e triage_status  
✅ Criar nota vincula movement_id  
✅ Estagiário não acessa API (403)  
✅ Não há cálculo automático de prazo  

## Mocks e Isolamento

### Supabase

Todos os testes usam mock do Supabase. **Nenhum teste toca o banco de produção.**

```javascript
jest.mock('@supabase/supabase-js');
```

### Gemini (Google AI)

Todas as chamadas à API Gemini são mockadas. **Nenhum teste consome quota real.**

```javascript
global.fetch = jest.fn(); // Mock fetch global
```

### WhatsApp Meta Cloud API

Todas as chamadas à API do WhatsApp são mockadas. **Nenhum teste envia mensagens reais.**

```javascript
global.fetch = jest.fn(); // Mock fetch global
```

### DataJud

Todas as chamadas ao DataJud são mockadas. **Nenhum teste consulta o CNJ real.**

```javascript
jest.mock('../../lib/datajudClient');
```

## Dados Sintéticos

Todos os testes usam dados sintéticos claramente marcados:

```javascript
const SYNTHETIC_VALUES = {
  phone: 'TELEFONE-SINTETICO-5511999999999',
  email: 'EMAIL-SINTETICO-cliente.teste@exemplo.com',
  name: 'NOME-SINTETICO-CLIENTE',
  token: 'TOKEN-SINTETICO-TESTE',
  cpf: 'CPF-SINTETICO-12345678900',
};
```

**NUNCA use dados reais em testes.**

## Verificação de PII

Os testes verificam que valores sintéticos específicos **NÃO** aparecem nos logs:

```javascript
expect(logs).not.toContain(SYNTHETIC_VALUES.phone);
expect(logs).not.toContain(SYNTHETIC_VALUES.email);
expect(logs).not.toContain(SYNTHETIC_VALUES.name);
```

E que valores seguros **APARECEM**:

```javascript
expect(logs).toContain('phoneHash');
expect(logs).toContain('correlationId');
```

## Relatório de Cobertura

Após executar `npm run test`, o relatório de cobertura estará disponível em:

```
coverage/
├── lcov-report/
│   └── index.html    # Abra no navegador
└── lcov.info         # Para ferramentas de CI
```

## Critérios de Aceite

✅ **Proteger fluxos críticos** (não cobertura global)  
✅ **Sem chamadas externas reais**  
✅ **Sem dados reais**  
✅ **Sem alteração de regras de negócio**  
✅ **Logs sem PII**  

## Lacunas Conhecidas

- ❌ Sem testes de integração entre módulos
- ❌ Sem testes de performance/carga
- ❌ Sem testes de acessibilidade (a11y)
- ❌ Sem testes de regressão visual
- ❌ Sem testes de segurança (OWASP)

## Próximos Testes Recomendados

1. **Testes de Integração**: Fluxo completo (webhook → triagem → nota)
2. **Testes de Mutação**: Validar qualidade dos testes
3. **Testes de Contrato**: Validar schemas de API
4. **Testes de Snapshot**: Componentes React
5. **Testes de E2E**: Playwright para fluxos críticos

## Troubleshooting

### Erro: "Cannot find module"

```bash
npm install
```

### Testes não encontrados

Verifique que os arquivos de teste estão em `__tests__/**/*.test.js`

### Mock não funciona

Verifique que `jest.setup.js` está sendo carregado corretamente.

### Cobertura baixa

Isso é esperado. O critério de aceite é **proteger fluxos críticos**, não cobertura global.

## Contribuindo

Ao adicionar novos testes:

1. ✅ Use dados sintéticos
2. ✅ Mocke serviços externos
3. ✅ Verifique ausência de PII nos logs
4. ✅ Não altere regras de negócio
5. ✅ Documente o que está sendo testado

## Suporte

Para dúvidas ou problemas, consulte:

- [Jest Documentation](https://jestjs.io/)
- [Testing Library](https://testing-library.com/)
- [Node Mocks HTTP](https://github.com/howardabrams/node-mocks-http)
