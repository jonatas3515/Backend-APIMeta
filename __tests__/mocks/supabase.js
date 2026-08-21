// Mock Supabase client for testing
const { 
  SYNTHETIC_USER_ADMIN, 
  SYNTHETIC_USER_ADVOGADO, 
  SYNTHETIC_USER_ESTAGIARIO,
  SYNTHETIC_CONVERSATION,
  SYNTHETIC_CASE,
  SYNTHETIC_KNOWLEDGE_DOC_APPROVED,
} = require('../fixtures/synthetic-data');

const createMockSupabaseClient = () => {
  const mockData = {
    users: [SYNTHETIC_USER_ADMIN, SYNTHETIC_USER_ADVOGADO, SYNTHETIC_USER_ESTAGIARIO],
    conversations: [SYNTHETIC_CONVERSATION],
    cases: [SYNTHETIC_CASE],
    knowledge_documents: [SYNTHETIC_KNOWLEDGE_DOC_APPROVED],
  };

  return {
    from: jest.fn((table) => ({
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
      single: jest.fn(() => Promise.resolve({ 
        data: mockData[table]?.[0] || null, 
        error: null 
      })),
      maybeSingle: jest.fn(() => Promise.resolve({ 
        data: mockData[table]?.[0] || null, 
        error: null 
      })),
      then: jest.fn((resolve) => resolve({ 
        data: mockData[table] || [], 
        error: null 
      })),
    })),
    auth: {
      getUser: jest.fn((token) => {
        if (token?.includes('admin')) {
          return Promise.resolve({ 
            data: { user: { id: SYNTHETIC_USER_ADMIN.auth_user_id } }, 
            error: null 
          });
        }
        if (token?.includes('advogado')) {
          return Promise.resolve({ 
            data: { user: { id: SYNTHETIC_USER_ADVOGADO.auth_user_id } }, 
            error: null 
          });
        }
        if (token?.includes('estagiario')) {
          return Promise.resolve({ 
            data: { user: { id: SYNTHETIC_USER_ESTAGIARIO.auth_user_id } }, 
            error: null 
          });
        }
        return Promise.resolve({ data: { user: null }, error: { message: 'Invalid token' } });
      }),
      signInWithPassword: jest.fn(({ email }) => {
        const user = mockData.users.find(u => u.email === email);
        if (user) {
          return Promise.resolve({
            data: { 
              user: { id: user.auth_user_id }, 
              session: { access_token: `token-${user.role}-synthetic` } 
            },
            error: null
          });
        }
        return Promise.resolve({ 
          data: { user: null, session: null }, 
          error: { message: 'Invalid credentials' } 
        });
      }),
    },
    rpc: jest.fn(() => Promise.resolve({ data: [], error: null })),
  };
};

module.exports = { createMockSupabaseClient };
