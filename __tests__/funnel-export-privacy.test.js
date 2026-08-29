/**
 * Testes de privacidade: exportações de Funil não devem conter PII.
 */

const { exportFunnelPdf, exportFunnelExcel } = require('../lib/export');

jest.mock('xlsx', () => {
  const captured = { rows: [] };
  const xlsx = {
    utils: {
      json_to_sheet: jest.fn((rows) => { captured.rows.push(rows); return {}; }),
      book_new: jest.fn(() => ({})),
      book_append_sheet: jest.fn()
    },
    write: jest.fn(() => []),
    __captured: captured
  };
  return xlsx;
});

jest.mock('jspdf', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    internal: {
      pageSize: {
        getWidth: jest.fn(() => 200),
        getHeight: jest.fn(() => 300)
      }
    },
    setFontSize: jest.fn(),
    text: jest.fn(),
    save: jest.fn(),
    addPage: jest.fn()
  }))
}));

jest.mock('jspdf-autotable', () => ({
  __esModule: true,
  default: jest.fn((doc, opts) => {
    doc.lastAutoTable = { finalY: 80 };
    doc.__lastAutoTableOptions = opts;
  })
}));

describe('Exportações do Funil - minimização de PII', () => {
  const metricsWithPii = [
    {
      funnel_stage: 'intake_concluido',
      total_count: 3,
      with_case_count: 2,
      human_mode_count: 1,
      avg_days_in_stage: 4.5,
      client_name: 'Maria Silva',
      client_phone: '(11) 99999-9999',
      email: 'maria@email.com',
      cpf: '123.456.789-00'
    },
    {
      funnel_stage: 'proposta_enviada',
      total_count: 1,
      with_case_count: 1,
      human_mode_count: 0,
      avg_days_in_stage: 2.0,
      client_name: 'João Souza',
      client_phone: '(21) 98888-8888',
      email: 'joao@email.com',
      cpf: '987.654.321-00'
    }
  ];

  const conversions = [
    { funnel_stage: 'proposta_enviada', count: 1, conversion_from_first: 33.3, drop_rate_from_previous: -66.7 }
  ];

  beforeEach(() => {
    global.URL = global.URL || {};
    global.URL.createObjectURL = jest.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = jest.fn();
    global.Blob = jest.fn((parts, opts) => ({ parts, opts }));
    document.createElement = jest.fn(() => ({ click: jest.fn(), remove: jest.fn() }));
    document.body.appendChild = jest.fn();
  });

  test('exportFunnelExcel não inclui nome, telefone, e-mail ou CPF', async () => {
    await exportFunnelExcel({ metrics: metricsWithPii, conversions });

    const XLSX = require('xlsx');
    const allRows = XLSX.__captured.rows.flat();
    const metricsRows = XLSX.__captured.rows[0] || [];

    expect(metricsRows.length).toBeGreaterThan(0);
    metricsRows.forEach((row) => {
      expect(Object.keys(row)).toEqual(['Etapa', 'Total', 'Com Caso', 'Em Atendimento Humano', 'Tempo Médio (dias)']);
      expect(row).not.toHaveProperty('client_name');
      expect(row).not.toHaveProperty('client_phone');
      expect(row).not.toHaveProperty('email');
      expect(row).not.toHaveProperty('cpf');
    });

    const piis = ['Maria Silva', 'João Souza', '(11) 99999-9999', '(21) 98888-8888', 'maria@email.com', 'joao@email.com', '123.456.789-00', '987.654.321-00'];
    const text = JSON.stringify(allRows);
    piis.forEach((pii) => {
      expect(text).not.toContain(pii);
    });
  });

  test('exportFunnelPdf não inclui PII nas tabelas', async () => {
    await exportFunnelPdf({ metrics: metricsWithPii, conversions });

    const jsPDF = require('jspdf').default;
    const doc = jsPDF.mock.results[0].value;
    const options = doc.__lastAutoTableOptions;

    const bodyText = JSON.stringify(options.body || []);
    const piis = ['Maria Silva', 'João Souza', '(11) 99999-9999', '(21) 98888-8888', 'maria@email.com', 'joao@email.com', '123.456.789-00', '987.654.321-00'];
    piis.forEach((pii) => {
      expect(bodyText).not.toContain(pii);
    });
  });
});
