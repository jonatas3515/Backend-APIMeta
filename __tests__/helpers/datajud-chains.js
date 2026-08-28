/**
 * Helpers para construir cadeias de query mockadas do Supabase.
 * Uso exclusivo em testes DataJud.
 */

function makeChain({ data = null, error = null } = {}) {
  const chain = {
    select: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    update: jest.fn(() => chain),
    delete: jest.fn(() => chain),
    upsert: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    neq: jest.fn(() => chain),
    in: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    range: jest.fn(() => chain),
    single: jest.fn().mockResolvedValue({ data, error }),
    maybeSingle: jest.fn().mockResolvedValue({ data, error }),
    then: jest.fn((onFulfilled) => onFulfilled({ data, error })),
    _data: data,
    _error: error,
  };
  return chain;
}

module.exports = { makeChain };
