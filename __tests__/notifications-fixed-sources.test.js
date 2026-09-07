/**
 * Testes das fontes de notificacao corrigidas (reminders, process_movements,
 * signatures) conforme schema real. Tudo mockado: sem banco, sem escrita.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const mockFrom = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: (...args) => mockFrom(...args) }))
}));

const { aggregateNotifications } = require('../lib/notificationAggregator');

// ---------------------------------------------------------------------------
// Chainable query builder "thenable" que registra chamadas por tabela
// ---------------------------------------------------------------------------
const CHAIN_METHODS = ['select', 'eq', 'neq', 'is', 'not', 'lte', 'lt', 'or', 'order', 'limit', 'in'];

let tableResults;   // table -> { data, error }
let tableCalls;     // table -> { method -> [args] }

function makeChain(table) {
  tableCalls[table] = {};
  const chain = {};
  CHAIN_METHODS.forEach((m) => {
    tableCalls[table][m] = [];
    chain[m] = jest.fn((...args) => {
      tableCalls[table][m].push(args);
      return chain;
    });
  });
  chain.then = (resolve, reject) =>
    Promise.resolve(tableResults[table] || { data: [], error: null }).then(resolve, reject);
  return chain;
}

beforeEach(() => {
  tableResults = {};
  tableCalls = {};
  mockFrom.mockReset();
  mockFrom.mockImplementation((table) => makeChain(table));
});

// IDs alfanumericos: UUIDs numericos falsos casam com o detector de PII
// (padrao de telefone) em isValidReferenceId e invalidam o link.
const USER_ID = 'user-1';
const OTHER_USER = 'user-2';
const CONV_ID = 'conv-1';
const CASE_ID = 'case-1';
const CASE_PROCESS_ID = 'cp-1';

function selectArg(table) {
  return (tableCalls[table]?.select?.[0]?.[0] || '').toString();
}

function eqArgs(table) {
  return tableCalls[table]?.eq || [];
}

// ---------------------------------------------------------------------------
// Fonte: reminders (chat_reminders)
// ---------------------------------------------------------------------------
describe('fonte reminders', () => {
  it('linha com status pending gera notificacao usando message/title/scheduled_for', async () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    tableResults.chat_reminders = {
      data: [{
        id: 'rem-1',
        conversation_id: CONV_ID,
        case_id: CASE_ID,
        title: 'Ligar para cliente',
        message: 'Retornar contato',
        scheduled_for: future,
        status: 'pending',
        created_by: 'admin',
        priority: 'alta',
        reminder_type: 'lembrete_cliente',
        created_at: new Date().toISOString(),
        conversations: { assigned_user_id: USER_ID }
      }],
      error: null
    };

    const result = await aggregateNotifications({ userId: USER_ID, userRole: 'admin' });

    const reminder = result.notifications.find(n => n.id === 'reminder-rem-1');
    expect(reminder).toBeTruthy();
    expect(reminder.type).toBe('reminder');
    expect(reminder.reference_id).toBe(CONV_ID);
    expect(result.errors.find(e => e.source === 'reminders')).toBeUndefined();
  });

  it('aplica filtro eq status pending e nao usa colunas antigas', async () => {
    tableResults.chat_reminders = { data: [], error: null };

    await aggregateNotifications({ userId: USER_ID, userRole: 'admin' });

    expect(eqArgs('chat_reminders')).toContainEqual(['status', 'pending']);

    const sel = selectArg('chat_reminders');
    expect(sel).toContain('message');
    expect(sel).toContain('title');
    expect(sel).toContain('scheduled_for');
    expect(sel).toContain('status');
    expect(sel).not.toContain('reminder_text');
    expect(sel).not.toContain('completed');
    expect(sel).not.toContain('cancelled');
    expect(sel).not.toContain('created_by_user_id');
  });

  it('nao-admin so ve lembretes de conversas atribuidas a ele', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    tableResults.chat_reminders = {
      data: [
        {
          id: 'rem-mine', conversation_id: CONV_ID, scheduled_for: future,
          status: 'pending', conversations: { assigned_user_id: USER_ID }
        },
        {
          id: 'rem-other', conversation_id: CONV_ID, scheduled_for: future,
          status: 'pending', conversations: { assigned_user_id: OTHER_USER }
        },
        {
          id: 'rem-no-conv', conversation_id: null, scheduled_for: future,
          status: 'pending', conversations: null
        }
      ],
      error: null
    };

    const result = await aggregateNotifications({ userId: USER_ID, userRole: 'advogado' });

    const ids = result.notifications.filter(n => n.id.startsWith('reminder-')).map(n => n.id);
    expect(ids).toContain('reminder-rem-mine');
    expect(ids).not.toContain('reminder-rem-other');
    expect(ids).not.toContain('reminder-rem-no-conv');
  });
});

// ---------------------------------------------------------------------------
// Fonte: process_movements (cadeia case_processes -> cases -> conversations)
// ---------------------------------------------------------------------------
describe('fonte process_movements', () => {
  it('usa embed case_processes!inner e nao seleciona case_id direto', async () => {
    tableResults.process_movements = { data: [], error: null };

    await aggregateNotifications({ userId: USER_ID, userRole: 'admin' });

    const sel = selectArg('process_movements');
    expect(sel).toContain('case_processes!inner');
    expect(sel).toContain('case_process_id');
    // na raiz do select (antes do embed) nao pode haver case_id nem cases!inner
    const root = sel.split('case_processes!inner')[0];
    expect(root).not.toContain('case_id');
    expect(root).not.toContain('cases!inner');
  });

  it('movimentacao nao revisada enriquecida pela cadeia gera notificacao', async () => {
    tableResults.process_movements = {
      data: [{
        id: 'mov-1',
        case_process_id: CASE_PROCESS_ID,
        movement_date: new Date().toISOString(),
        movement_text: 'Juntada de peticao',
        reviewed_at: null,
        triage_status: 'novo',
        priority: 'alta',
        case_processes: {
          case_id: CASE_ID,
          cases: {
            id: CASE_ID,
            conversation_id: CONV_ID,
            legal_area: 'Civel',
            municipality: 'Curitiba',
            conversations: { assigned_user_id: USER_ID }
          }
        }
      }],
      error: null
    };

    const result = await aggregateNotifications({ userId: USER_ID, userRole: 'advogado' });

    const mov = result.notifications.find(n => n.id === 'movement-mov-1');
    expect(mov).toBeTruthy();
    expect(mov.type).toBe('process_movement');
    expect(result.errors.find(e => e.source === 'process_movements')).toBeUndefined();
  });

  it('movimentacao sem caso/conversa relacionado nao quebra a fonte', async () => {
    tableResults.process_movements = {
      data: [{
        id: 'mov-orphan',
        case_process_id: CASE_PROCESS_ID,
        movement_date: new Date().toISOString(),
        movement_text: 'Movimento orfao',
        reviewed_at: null,
        case_processes: null
      }],
      error: null
    };

    const result = await aggregateNotifications({ userId: USER_ID, userRole: 'admin' });

    expect(result.errors.find(e => e.source === 'process_movements')).toBeUndefined();
    const mov = result.notifications.find(n => n.id === 'movement-mov-orphan');
    expect(mov).toBeTruthy();
  });

  it('nao-admin so ve movimentos de casos atribuidos a ele', async () => {
    const base = {
      movement_date: new Date().toISOString(),
      reviewed_at: null,
      case_process_id: CASE_PROCESS_ID
    };
    tableResults.process_movements = {
      data: [
        {
          ...base, id: 'mov-mine',
          case_processes: { case_id: CASE_ID, cases: { id: CASE_ID, conversation_id: CONV_ID, conversations: { assigned_user_id: USER_ID } } }
        },
        {
          ...base, id: 'mov-other',
          case_processes: { case_id: CASE_ID, cases: { id: CASE_ID, conversation_id: CONV_ID, conversations: { assigned_user_id: OTHER_USER } } }
        }
      ],
      error: null
    };

    const result = await aggregateNotifications({ userId: USER_ID, userRole: 'advogado' });

    const ids = result.notifications.filter(n => n.id.startsWith('movement-')).map(n => n.id);
    expect(ids).toContain('movement-mov-mine');
    expect(ids).not.toContain('movement-mov-other');
  });
});

// ---------------------------------------------------------------------------
// Fonte: signatures (document_signatures)
// ---------------------------------------------------------------------------
describe('fonte signatures', () => {
  it('assinatura pending gera notificacao e usa created_by', async () => {
    tableResults.document_signatures = {
      data: [{
        id: 'sig-1',
        document_name: 'Contrato.pdf',
        status: 'pending',
        created_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        created_by: USER_ID
      }],
      error: null
    };

    const result = await aggregateNotifications({ userId: USER_ID, userRole: 'advogado' });

    const sig = result.notifications.find(n => n.id === 'signature-sig-1');
    expect(sig).toBeTruthy();
    expect(sig.type).toBe('signature');

    const sel = selectArg('document_signatures');
    expect(sel).toContain('created_by');
    expect(sel).not.toContain('created_by_user_id');
    expect(eqArgs('document_signatures')).toContainEqual(['created_by', USER_ID]);
    expect(eqArgs('document_signatures')).toContainEqual(['status', 'pending']);
  });

  it('lista vazia retorna sem erro', async () => {
    tableResults.document_signatures = { data: [], error: null };

    const result = await aggregateNotifications({ userId: USER_ID, userRole: 'admin' });

    expect(result.notifications.filter(n => n.type === 'signature')).toHaveLength(0);
    expect(result.errors.find(e => e.source === 'signatures')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Agregador: isolamento de erro e countReliable
// ---------------------------------------------------------------------------
describe('agregador', () => {
  it('falha em uma fonte fica isolada e countReliable vira false', async () => {
    tableResults.cases = { data: null, error: { code: '42703', message: 'boom' } };
    tableResults.document_signatures = {
      data: [{
        id: 'sig-ok', document_name: 'Doc', status: 'pending',
        created_at: new Date().toISOString(), created_by: USER_ID
      }],
      error: null
    };

    const result = await aggregateNotifications({ userId: USER_ID, userRole: 'admin' });

    expect(result.countReliable).toBe(false);
    // deadlines e cases usam a tabela cases -> duas fontes falham
    const failedSources = result.errors.map(e => e.source);
    expect(failedSources).toContain('deadlines');
    expect(failedSources).toContain('cases');
    // demais fontes continuam retornando
    expect(result.notifications.find(n => n.id === 'signature-sig-ok')).toBeTruthy();
  });

  it('todas as fontes ok resulta em countReliable true e sem erros', async () => {
    const result = await aggregateNotifications({ userId: USER_ID, userRole: 'admin' });

    expect(result.countReliable).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
