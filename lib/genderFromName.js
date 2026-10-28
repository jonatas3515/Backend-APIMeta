// ============================================================================
// TRATAMENTO DE NOME E GÊNERO
// ============================================================================
// - Normalização remove acentos e padroniza maiúsculas/minúsculas.
// - Nomes ambíguos, raros, estrangeiros ou unissex NUNCA são usados como
//   prova de gênero.
// - Só se atribui "senhor" ou "senhora" quando houver sinal forte e claro.
// - Preferência explícita do usuário (pronome, "sou homem/mulher", correção)
//   deve ser respeitada fora deste módulo e prevalecer.
// ============================================================================

const FEMALE_EXCEPTIONS = new Set([
  'emanuelly', 'emanuely', 'emilly', 'emily', 'geovanna', 'geovana',
  'gaby', 'gabrielly', 'gabriely', 'kamily', 'kamilly',
  'nathally', 'nathaly', 'rafaelly', 'rafaely',
  'samily', 'samilly', 'samira', 'beatriz', 'raquel', 'carmen', 'ester', 'esther',
  'isabel', 'miriam', 'myrian', 'clarice', 'alice', 'monique', 'elis', 'sueli', 'suely',
  'cleide', 'salete', 'neide', 'ivone', 'shirley'
]);

const MALE_EXCEPTIONS = new Set([
  'andrey', 'carlos', 'dimitry', 'dmitry', 'jhon', 'jhonn', 'jhony', 'jhonny', 'johnny', 'jonny',
  'jordy', 'monty', 'muricy', 'roney', 'ronny', 'vitaly', 'jonatas', 'lucas', 'marcos',
  'gabriel', 'rafael', 'felipe', 'alexandre', 'arthur', 'artur', 'vitor', 'victor',
  'davi', 'david', 'erick', 'eric', 'samuel', 'daniel', 'miguel', 'igor', 'cesar',
  'jorge', 'guilherme', 'henrique', 'filipe', 'luis', 'luiz', 'wesley', 'anthony',
  'robson', 'edson', 'nelson', 'gilberto', 'roberto', 'joaquim', 'renan', 'elias', 'jonas'
]);

// Nomes que são usados para mais de um gênero, são raros, estrangeiros,
// têm grafia incomum ou terminam em vogal que não permite conclusão segura.
// A lista serve como proteção contra inferência automática; nunca decide direitos.
const AMBIGUOUS_NAMES = new Set([
  'anais', 'artemis', 'dolores', 'ines', 'iris', 'isis', 'janis', 'liz',
  'lourdes', 'mercedes', 'tais',
  'alex', 'bellatrix', 'felix', 'fenix', 'margaux', 'nyx', 'pax', 'trix',
  'cruz', 'luz', 'paz', 'mariluz',
  'alison', 'ariel', 'cris', 'dani', 'darcy', 'dominique', 'duda', 'eden',
  'francis', 'jaci', 'jean', 'juraci', 'kim', 'manu', 'michel', 'rafa',
  'robin', 'sam', 'sasha', 'sidney', 'taylor', 'yuri',
  'hendrix', 'knox', 'lennox', 'max', 'rex', 'aziz', 'diniz', 'ruiz',
  'tomaz', 'andy', 'billy', 'danny', 'henry', 'tony',
  'luca', 'nicola',
  'andrea'
]);

function normalizeFirstName(name) {
  if (!name) return null;
  const first = String(name)
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return first || null;
}

export function getGenderFromName(name) {
  const first = normalizeFirstName(name);
  if (!first) return null;

  if (AMBIGUOUS_NAMES.has(first)) return null;
  if (FEMALE_EXCEPTIONS.has(first)) return 'female';
  if (MALE_EXCEPTIONS.has(first)) return 'male';

  const last = first.slice(-1);

  // Última letra não é prova suficiente isoladamente, mas "a" e "o" são
  // sinais auxiliares comuns no português e serão usados apenas quando o nome
  // não estiver na lista de ambíguos/exceções.
  if (last === 'a') return 'female';
  if (last === 'o') return 'male';

  return null;
}

export function getClientTitle(name) {
  const gender = getGenderFromName(name);
  if (gender === 'female') return 'senhora';
  if (gender === 'male') return 'senhor';
  return null;
}

export function getSalutationPrefix(name) {
  const gender = getGenderFromName(name);
  if (gender === 'female') return 'Sr.ª';
  if (gender === 'male') return 'Sr.';
  return 'Sr(a).';
}

export function formatClientSalutation(clientName) {
  if (!clientName || String(clientName).trim() === '' || clientName === 'Cliente') {
    return 'Olá, tudo bem?';
  }
  const rawFirst = String(clientName).trim().split(/\s+/)[0];
  const firstName = rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase();
  const prefix = getSalutationPrefix(rawFirst);
  return `Olá ${prefix} ${firstName}, tudo bem?`;
}

export function getClientGreeting(clientName) {
  if (!clientName || clientName === 'Cliente') return 'Olá';
  const title = getClientTitle(clientName);
  const firstName = String(clientName).trim().split(/\s+/)[0];
  if (title) {
    const cap = title[0].toUpperCase() + title.slice(1);
    return `${cap} ${firstName}`;
  }
  return firstName;
}
