import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OfficeAIAssistant from '../components/OfficeAIAssistant';

jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({ Authorization: 'Bearer test' }))
}));

const AI_ANSWER = 'EXCELENTÍSSIMO SENHOR JUIZ...\n\n[PREENCHER] fatos.';
const LONG_QUERY = 'Gere uma petição inicial consumerista por cobrança indevida de tarifa bancária não contratada';

function buildResponse(data, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data)
  });
}

let fetchCalls;
beforeEach(() => {
  fetchCalls = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    fetchCalls.push({ url, opts });
    if (url.startsWith('/api/ai/ask')) return buildResponse({ answer: AI_ANSWER, sources: [] });
    if (url.startsWith('/api/knowledge/documents')) return buildResponse({ document: { id: 'kd-1' }, chunks: 2 });
    if (opts.method === 'POST' && url.startsWith('/api/templates')) return buildResponse({ id: 'tpl-1' }, 201);
    if (url.startsWith('/api/templates')) return buildResponse([]);
    return buildResponse({});
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

async function askWithFilters() {
  render(<OfficeAIAssistant />);
  const [areaSelect, typeSelect, tribunalSelect] = screen.getAllByRole('combobox');
  fireEvent.change(areaSelect, { target: { value: 'consumidor' } });
  fireEvent.change(typeSelect, { target: { value: 'modelo_peca' } });
  fireEvent.change(tribunalSelect, { target: { value: 'TJBA' } });
  fireEvent.change(screen.getByPlaceholderText(/Gere uma petição/), { target: { value: LONG_QUERY } });
  fireEvent.click(screen.getByText('Consultar IA'));
  await screen.findByText(/EXCELENTÍSSIMO SENHOR JUIZ/);
}

describe('OfficeAIAssistant - salvar resposta da IA', () => {
  test('exibe botoes de copiar, salvar na base e salvar como modelo apos resposta', async () => {
    await askWithFilters();
    expect(screen.getByText('📋 Copiar')).toBeInTheDocument();
    expect(screen.getByTestId('btn-save-knowledge')).toBeInTheDocument();
    expect(screen.getByTestId('btn-save-template')).toBeInTheDocument();
  });

  test('Salvar na Base abre modal pre-preenchido e envia POST /api/knowledge/documents', async () => {
    await askWithFilters();
    fireEvent.click(screen.getByTestId('btn-save-knowledge'));

    // Pre-preenchimento: titulo a partir da query, tipo/area/tribunal dos filtros
    expect(screen.getByTestId('knowledge-title').value).toBe(`${LONG_QUERY.slice(0, 50)}…`);
    expect(screen.getByTestId('knowledge-type').value).toBe('modelo_peca');
    expect(screen.getByTestId('knowledge-area').value).toBe('consumidor');
    expect(screen.getByTestId('knowledge-tribunal').value).toBe('TJBA');
    expect(screen.getByTestId('knowledge-content').value).toBe(AI_ANSWER);

    fireEvent.click(screen.getByTestId('knowledge-confirm'));

    await waitFor(() => {
      const call = fetchCalls.find(c => c.url === '/api/knowledge/documents' && c.opts.method === 'POST');
      expect(call).toBeTruthy();
      const body = JSON.parse(call.opts.body);
      expect(body.title).toBe(`${LONG_QUERY.slice(0, 50)}…`);
      expect(body.type).toBe('modelo_peca');
      expect(body.area).toBe('consumidor');
      expect(body.tribunal).toBe('TJBA');
      expect(body.content).toBe(AI_ANSWER);
    });

    await screen.findByTestId('ai-save-feedback');
    expect(screen.getByTestId('ai-save-feedback')).toHaveTextContent('Base de Conhecimento');
  });

  test('Salvar como Modelo envia POST /api/templates com nome e texto', async () => {
    await askWithFilters();
    fireEvent.click(screen.getByTestId('btn-save-template'));

    expect(screen.getByTestId('template-name').value).toBe(`${LONG_QUERY.slice(0, 50)}…`);
    expect(screen.getByTestId('template-description').value).toBe('Minuta gerada via Assistente IA');
    expect(screen.getByTestId('template-area').value).toBe('consumidor');
    expect(screen.getByTestId('template-text').value).toBe(AI_ANSWER);

    fireEvent.click(screen.getByTestId('template-confirm'));

    await waitFor(() => {
      const call = fetchCalls.find(c => c.url === '/api/templates' && c.opts.method === 'POST');
      expect(call).toBeTruthy();
      const body = JSON.parse(call.opts.body);
      expect(body.name).toBe(`${LONG_QUERY.slice(0, 50)}…`);
      expect(body.description).toBe('Minuta gerada via Assistente IA');
      expect(body.legal_area).toBe('consumidor');
      expect(body.template_text).toBe(AI_ANSWER);
    });

    await screen.findByTestId('ai-save-feedback');
    expect(screen.getByTestId('ai-save-feedback')).toHaveTextContent('Modelos de Documento');
  });

  test('campos do modal podem ser editados antes de salvar', async () => {
    await askWithFilters();
    fireEvent.click(screen.getByTestId('btn-save-knowledge'));

    fireEvent.change(screen.getByTestId('knowledge-title'), { target: { value: 'Tese customizada' } });
    fireEvent.change(screen.getByTestId('knowledge-type'), { target: { value: 'tese' } });
    fireEvent.click(screen.getByTestId('knowledge-confirm'));

    await waitFor(() => {
      const call = fetchCalls.find(c => c.url === '/api/knowledge/documents' && c.opts.method === 'POST');
      const body = JSON.parse(call.opts.body);
      expect(body.title).toBe('Tese customizada');
      expect(body.type).toBe('tese');
    });
  });

  test('erro na API de salvamento exibe mensagem sem quebrar a tela', async () => {
    global.fetch = jest.fn(async (url, opts = {}) => {
      fetchCalls.push({ url, opts });
      if (url.startsWith('/api/ai/ask')) return buildResponse({ answer: AI_ANSWER, sources: [] });
      if (url.startsWith('/api/knowledge/documents')) return buildResponse({ error: 'Permissão negada' }, 403);
      if (url.startsWith('/api/templates')) return buildResponse([]);
      return buildResponse({});
    });

    await askWithFilters();
    fireEvent.click(screen.getByTestId('btn-save-knowledge'));
    fireEvent.click(screen.getByTestId('knowledge-confirm'));

    await waitFor(() => {
      expect(screen.getByText('Permissão negada')).toBeInTheDocument();
    });
  });
});
