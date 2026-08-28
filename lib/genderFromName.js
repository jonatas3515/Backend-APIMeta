const FEMALE_EXCEPTIONS = new Set([
  'emanuelly', 'emanuely', 'emilly', 'emily', 'geovanna', 'geovana',
  'gaby', 'gabrielly', 'gabriely', 'kamily', 'kamilly', 'kamilly',
  'nathally', 'nathaly', 'nathally', 'rafaelly', 'rafaely',
  'samily', 'samilly', 'samira'
]);

const MALE_EXCEPTIONS = new Set([
  'andrey', 'dimitry', 'dmitry', 'henry', 'jhon', 'jhonn', 'jhony', 'jhonny', 'johnny', 'jonny',
  'jordy', 'monty', 'muricy',
  'roney', 'ronny', 'sidney', 'sidnei', 'vitaly', 'wesley'
]);

export function getGenderFromName(name) {
  if (!name) return null;
  const first = name
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!first) return null;

  if (FEMALE_EXCEPTIONS.has(first)) return 'female';
  if (MALE_EXCEPTIONS.has(first)) return 'male';

  const last = first.slice(-1);
  if (last === 'a') return 'female';
  if (last === 'o') return 'male';

  // Casos terminados em vogais comuns para nomes femininos brasileiros
  if (last === 'y' || last === 'i' || last === 'e') return 'female';

  return null;
}

export function getClientTitle(name) {
  const gender = getGenderFromName(name);
  if (gender === 'female') return 'senhora';
  if (gender === 'male') return 'senhor';
  return null;
}
