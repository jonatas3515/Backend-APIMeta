/**
 * Fonte única e whitelist de tribunais suportados pela API pública DataJud.
 * Nunca expõe URL, endpoint, chaves ou permite alias arbitrários.
 */

export const DATAJUD_BASE_URL = 'https://api-publica.datajud.cnj.jus.br';

const TJ_DETAILS = {
  tjac: { name: 'Tribunal de Justiça do Acre', uf: 'AC' },
  tjal: { name: 'Tribunal de Justiça de Alagoas', uf: 'AL' },
  tjam: { name: 'Tribunal de Justiça do Amazonas', uf: 'AM' },
  tjap: { name: 'Tribunal de Justiça do Amapá', uf: 'AP' },
  tjba: { name: 'Tribunal de Justiça da Bahia', uf: 'BA' },
  tjce: { name: 'Tribunal de Justiça do Ceará', uf: 'CE' },
  tjdft: { name: 'Tribunal de Justiça do Distrito Federal e dos Territórios', uf: 'DF' },
  tjes: { name: 'Tribunal de Justiça do Espírito Santo', uf: 'ES' },
  tjgo: { name: 'Tribunal de Justiça de Goiás', uf: 'GO' },
  tjma: { name: 'Tribunal de Justiça do Maranhão', uf: 'MA' },
  tjmg: { name: 'Tribunal de Justiça de Minas Gerais', uf: 'MG' },
  tjms: { name: 'Tribunal de Justiça do Mato Grosso do Sul', uf: 'MS' },
  tjmt: { name: 'Tribunal de Justiça do Mato Grosso', uf: 'MT' },
  tjpa: { name: 'Tribunal de Justiça do Pará', uf: 'PA' },
  tjpb: { name: 'Tribunal de Justiça da Paraíba', uf: 'PB' },
  tjpe: { name: 'Tribunal de Justiça de Pernambuco', uf: 'PE' },
  tjpi: { name: 'Tribunal de Justiça do Piauí', uf: 'PI' },
  tjpr: { name: 'Tribunal de Justiça do Paraná', uf: 'PR' },
  tjrj: { name: 'Tribunal de Justiça do Rio de Janeiro', uf: 'RJ' },
  tjrn: { name: 'Tribunal de Justiça do Rio Grande do Norte', uf: 'RN' },
  tjro: { name: 'Tribunal de Justiça de Rondônia', uf: 'RO' },
  tjrr: { name: 'Tribunal de Justiça de Roraima', uf: 'RR' },
  tjrs: { name: 'Tribunal de Justiça do Rio Grande do Sul', uf: 'RS' },
  tjsc: { name: 'Tribunal de Justiça de Santa Catarina', uf: 'SC' },
  tjse: { name: 'Tribunal de Justiça de Sergipe', uf: 'SE' },
  tjsp: { name: 'Tribunal de Justiça de São Paulo', uf: 'SP' },
  tjto: { name: 'Tribunal de Justiça do Tocantins', uf: 'TO' },
};

const TRF_DETAILS = {
  trf1: { name: 'Tribunal Regional Federal da 1ª Região', region: '1ª' },
  trf2: { name: 'Tribunal Regional Federal da 2ª Região', region: '2ª' },
  trf3: { name: 'Tribunal Regional Federal da 3ª Região', region: '3ª' },
  trf4: { name: 'Tribunal Regional Federal da 4ª Região', region: '4ª' },
  trf5: { name: 'Tribunal Regional Federal da 5ª Região', region: '5ª' },
  trf6: { name: 'Tribunal Regional Federal da 6ª Região', region: '6ª' },
};

const LABOR_COURTS = [
  { code: 'trt5', name: 'Tribunal Regional do Trabalho da 5ª Região', alias: 'api_publica_trt5', uf: 'BA' },
  { code: 'trt8', name: 'Tribunal Regional do Trabalho da 8ª Região', alias: 'api_publica_trt8', uf: 'ES' },
];

const SUPERIOR_COURTS = [
  { code: 'tst', name: 'Tribunal Superior do Trabalho', alias: 'api_publica_tst' },
  { code: 'stj', name: 'Superior Tribunal de Justiça', alias: 'api_publica_stj' },
  { code: 'tse', name: 'Tribunal Superior Eleitoral', alias: 'api_publica_tse' },
  { code: 'stm', name: 'Superior Tribunal Militar', alias: 'api_publica_stm' },
];

const ELECTORAL_COURTS = [
  { code: 'tre-ba', name: 'Tribunal Regional Eleitoral da Bahia', alias: 'api_publica_tre-ba', uf: 'BA' },
  { code: 'tre-sp', name: 'Tribunal Regional Eleitoral de São Paulo', alias: 'api_publica_tre-sp', uf: 'SP' },
  { code: 'tre-rj', name: 'Tribunal Regional Eleitoral do Rio de Janeiro', alias: 'api_publica_tre-rj', uf: 'RJ' },
  { code: 'tre-es', name: 'Tribunal Regional Eleitoral do Espírito Santo', alias: 'api_publica_tre-es', uf: 'ES' },
  { code: 'tre-mg', name: 'Tribunal Regional Eleitoral de Minas Gerais', alias: 'api_publica_tre-mg', uf: 'MG' },
  { code: 'tre-df', name: 'Tribunal Regional Eleitoral do Distrito Federal', alias: 'api_publica_tre-df', uf: 'DF' },
  { code: 'tre-pa', name: 'Tribunal Regional Eleitoral do Pará', alias: 'api_publica_tre-pa', uf: 'PA' },
];

// Mapeia códigos legados/corriqueiros para o código canônico
const LEGACY_CODE_MAP = {
  tjdf: 'tjdft',
};

function buildCourtsList() {
  const courts = [];

  for (const [code, details] of Object.entries(TJ_DETAILS)) {
    courts.push({
      code: code.toUpperCase(),
      name: details.name,
      branch: 'Justiça Estadual',
      uf: details.uf,
      alias: `api_publica_${code}`,
    });
  }

  for (const [code, details] of Object.entries(TRF_DETAILS)) {
    courts.push({
      code: code.toUpperCase(),
      name: details.name,
      branch: 'Justiça Federal',
      uf: null,
      alias: `api_publica_${code}`,
    });
  }

  for (const c of LABOR_COURTS) {
    courts.push({
      code: c.code.toUpperCase(),
      name: c.name,
      branch: 'Justiça do Trabalho',
      uf: c.uf || null,
      alias: c.alias,
    });
  }

  courts.push({
    code: 'TST',
    name: 'Tribunal Superior do Trabalho',
    branch: 'Justiça do Trabalho',
    uf: null,
    alias: 'api_publica_tst',
  });

  for (const c of ELECTORAL_COURTS) {
    courts.push({
      code: c.code.toUpperCase(),
      name: c.name,
      branch: 'Justiça Eleitoral',
      uf: c.uf,
      alias: c.alias,
    });
  }

  for (const c of SUPERIOR_COURTS.filter((c) => c.code !== 'tst')) {
    courts.push({
      code: c.code.toUpperCase(),
      name: c.name,
      branch: 'Justiça Superior',
      uf: null,
      alias: c.alias,
    });
  }

  return courts;
}

export const DATAJUD_COURTS = buildCourtsList();

export const COURT_BRANCHES = [...new Set(DATAJUD_COURTS.map((c) => c.branch))];

export function normalizeCourtCode(code) {
  const raw = String(code || '').toLowerCase().trim();
  return LEGACY_CODE_MAP[raw] || raw;
}

export function getCourtByCode(code) {
  const canonical = normalizeCourtCode(code);
  return DATAJUD_COURTS.find((c) => c.code.toLowerCase() === canonical) || null;
}

export function getCourtName(code) {
  const court = getCourtByCode(code);
  return court ? court.name : code?.toUpperCase() || '';
}

export function resolveCourtAlias(code) {
  const court = getCourtByCode(code);
  return court ? court.alias : null;
}

export function isValidCourtCode(code) {
  return !!getCourtByCode(code);
}
