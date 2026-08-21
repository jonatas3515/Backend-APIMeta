// Setup global mocks and test environment

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'MOCK-SERVICE-KEY-FOR-TESTING';
process.env.GOOGLE_AI_API_KEY = 'MOCK-GOOGLE-AI-KEY-FOR-TESTING';
process.env.WHATSAPP_TOKEN = 'MOCK-WHATSAPP-TOKEN-FOR-TESTING';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'MOCK-PHONE-ID-FOR-TESTING';
process.env.WEBHOOK_VERIFY_TOKEN = 'MOCK-VERIFY-TOKEN-FOR-TESTING';
process.env.DATAJUD_API_KEY = 'MOCK-DATAJUD-KEY-FOR-TESTING';
process.env.NODE_ENV = 'test';

// Suppress console logs during tests (except errors)
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: console.error, // Keep errors visible
};

// Mock fetch globally
global.fetch = jest.fn();

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
    })),
    auth: {
      getUser: jest.fn(() => Promise.resolve({ 
        data: { user: { id: 'mock-user-id' } }, 
        error: null 
      })),
      signInWithPassword: jest.fn(() => Promise.resolve({
        data: { user: { id: 'mock-user-id' }, session: { access_token: 'mock-token' } },
        error: null
      })),
    },
    rpc: jest.fn(() => Promise.resolve({ data: [], error: null })),
  })),
}));

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch.mockClear();
});
