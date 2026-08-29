// Test utilities for ProcessTriagePanel

export const MOCK_USERS = [
  { id: 'u1', name: 'Dr. Ana', role: 'advogado' },
  { id: 'u2', name: 'Dr. Bruno', role: 'advogado' },
  { id: 'u3', name: 'Maria', role: 'admin' }
];

export const MOCK_STATS = {
  total: 4,
  by_status: { novo: 2, em_analise: 1, revisado: 1 },
  by_priority: { baixa: 1, media: 1, alta: 1, urgente: 1 },
  by_classification: { intimacao: 2, prazo_potencial: 2 },
  my_pendencies: 1
};

export const MOCK_MOVEMENTS = [
  {
    id: 'm1',
    triage_status: 'novo',
    priority: 'urgente',
    legal_classification: 'prazo_potencial',
    movement_date: '2024-10-01',
    detected_at: '2024-10-01T10:00:00Z',
    movement_summary: 'Publicação de movimentação processual',
    case_process: {
      id: 'cp1',
      process_number: '0000001-00.2024.8.00.0000',
      court_name: 'Tribunal de Justiça RS',
      court_code: 'TJRS',
      case: {
        id: 'c1',
        title: 'Ação Trabalhista nº 0000001',
        legal_area: 'Trabalhista'
      }
    },
    assigned_user_id: null,
    assigned_user: null
  },
  {
    id: 'm2',
    triage_status: 'em_analise',
    priority: 'alta',
    legal_classification: 'intimacao',
    movement_date: '2024-09-25',
    detected_at: '2024-09-26T08:00:00Z',
    movement_summary: 'Intimação eletrônica publicada',
    case_process: {
      id: 'cp2',
      process_number: '0000002-00.2024.8.00.0000',
      court_name: 'Tribunal Regional Federal 4ª Região',
      court_code: 'TRF4',
      case: {
        id: 'c2',
        title: 'Ação Previdenciária nº 0000002',
        legal_area: 'Previdenciário'
      }
    },
    assigned_user_id: 'u1',
    assigned_user: { name: 'Dr. Ana' }
  },
  {
    id: 'm3',
    triage_status: 'novo',
    priority: 'baixa',
    legal_classification: 'intimacao',
    movement_date: '2024-09-20',
    detected_at: '2024-09-21T11:00:00Z',
    movement_summary: 'Intimação eletrônica publicada',
    case_process: {
      id: 'cp3',
      process_number: '0000003-00.2024.8.00.0000',
      court_name: 'Tribunal de Justiça RS',
      court_code: 'TJRS',
      case: {
        id: 'c3',
        title: 'Ação Cível nº 0000003',
        legal_area: 'Cível'
      }
    },
    assigned_user_id: 'u2',
    assigned_user: { name: 'Dr. Bruno' }
  },
  {
    id: 'm4',
    triage_status: 'revisado',
    priority: 'media',
    legal_classification: 'despacho',
    movement_date: '2024-09-15',
    detected_at: '2024-09-16T14:00:00Z',
    movement_summary: 'Despacho em mesa eletrônica',
    case_process: {
      id: 'cp4',
      process_number: '0000004-00.2024.8.00.0000',
      court_name: 'Tribunal de Justiça RS',
      court_code: 'TJRS',
      case: {
        id: 'c4',
        title: 'Ação Família nº 0000004',
        legal_area: 'Família'
      }
    },
    assigned_user_id: 'u1',
    assigned_user: { name: 'Dr. Ana' }
  }
];

export const MOCK_HISTORY = [
  {
    id: 'h1',
    action: 'update_triage',
    created_at: '2024-09-26T08:30:00Z',
    user: { name: 'Dr. Ana' },
    old_status: 'novo',
    new_status: 'em_analise',
    old_priority: 'media',
    new_priority: 'alta'
  },
  {
    id: 'h2',
    action: 'create_note',
    created_at: '2024-09-26T09:00:00Z',
    user: { name: 'Dr. Ana' },
    notes: 'Nota criada: note-uuid'
  }
];

function buildResponse(data, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data)
  });
}

export function setupTriage(options = {}) {
  const {
    movements = MOCK_MOVEMENTS,
    stats = MOCK_STATS,
    users = MOCK_USERS,
    history = MOCK_HISTORY,
    detailMovement = movements[0],
    total,
    totalPages,
    pageSize
  } = options;

  const totalCount = total ?? movements.length;
  const totalPageCount = totalPages ?? 1;
  const limit = pageSize || 20;

  if (typeof window !== 'undefined') {
    window.matchMedia = jest.fn().mockImplementation((q) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }));
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  }

  global.fetch = jest.fn(async (url, opts = {}) => {
    const uri = new URL(url, 'http://localhost');
    const action = uri.searchParams.get('action');
    const page = uri.searchParams.get('page');

    if (url.startsWith('/api/collaboration?action=users')) {
      return buildResponse({ users });
    }

    if (url.startsWith('/api/triage?action=stats')) {
      return buildResponse(stats);
    }

    if (url.startsWith('/api/triage?action=list')) {
      const pageNum = parseInt(page || '1', 10);
      const start = (pageNum - 1) * limit;
      const end = start + limit;
      const pageMovements = movements.slice(start, end);
      return buildResponse({
        movements: pageMovements,
        total: totalCount,
        page: pageNum,
        limit,
        totalPages: totalPageCount
      });
    }

    if (url.startsWith('/api/triage?id=') && !opts.method) {
      return buildResponse({ movement: detailMovement, history });
    }

    if (opts.method === 'PATCH') {
      return buildResponse({ ok: true });
    }

    if (opts.method === 'POST') {
      if (action === 'create_note') return buildResponse({ id: 'note1', text: 'Nota' }, 201);
      if (action === 'create_reminder') return buildResponse({ id: 'rem1' }, 201);
      if (action === 'create_event') return buildResponse({ id: 'evt1' }, 201);
      if (action === 'suggest') {
        return buildResponse({
          suggested_classification: 'prazo_potencial',
          suggested_priority: 'alta',
          disclaimer: 'Sugestão automática, não deve ser usada como decisão jurídica.'
        });
      }
      return buildResponse({});
    }

    return buildResponse({ error: 'not found' }, 404);
  });
}
