// Synthetic webhook payloads for testing
const { SYNTHETIC_VALUES } = require('./synthetic-data');

const WEBHOOK_CONSENT_ACCEPT_1 = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'entry-synthetic-001',
    changes: [{
      value: {
        messaging_product: 'whatsapp',
        metadata: {
          display_phone_number: '5511999999999',
          phone_number_id: 'MOCK-PHONE-ID-FOR-TESTING',
        },
        messages: [{
          from: SYNTHETIC_VALUES.phone,
          id: 'msg-synthetic-001',
          timestamp: '1234567890',
          type: 'text',
          text: { body: '1' },
        }],
      },
      field: 'messages',
    }],
  }],
};

const WEBHOOK_CONSENT_ACCEPT_ACEITO = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'entry-synthetic-002',
    changes: [{
      value: {
        messaging_product: 'whatsapp',
        metadata: {
          display_phone_number: '5511999999999',
          phone_number_id: 'MOCK-PHONE-ID-FOR-TESTING',
        },
        messages: [{
          from: SYNTHETIC_VALUES.phone,
          id: 'msg-synthetic-002',
          timestamp: '1234567890',
          type: 'text',
          text: { body: 'ACEITO' },
        }],
      },
      field: 'messages',
    }],
  }],
};

const WEBHOOK_CONSENT_REJECT_2 = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'entry-synthetic-003',
    changes: [{
      value: {
        messaging_product: 'whatsapp',
        metadata: {
          display_phone_number: '5511999999999',
          phone_number_id: 'MOCK-PHONE-ID-FOR-TESTING',
        },
        messages: [{
          from: SYNTHETIC_VALUES.phone,
          id: 'msg-synthetic-003',
          timestamp: '1234567890',
          type: 'text',
          text: { body: '2' },
        }],
      },
      field: 'messages',
    }],
  }],
};

const WEBHOOK_CONSENT_REJECT_REVOGO = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'entry-synthetic-004',
    changes: [{
      value: {
        messaging_product: 'whatsapp',
        metadata: {
          display_phone_number: '5511999999999',
          phone_number_id: 'MOCK-PHONE-ID-FOR-TESTING',
        },
        messages: [{
          from: SYNTHETIC_VALUES.phone,
          id: 'msg-synthetic-004',
          timestamp: '1234567890',
          type: 'text',
          text: { body: 'REVOGO' },
        }],
      },
      field: 'messages',
    }],
  }],
};

const WEBHOOK_SIMPLE_MESSAGE = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'entry-synthetic-005',
    changes: [{
      value: {
        messaging_product: 'whatsapp',
        metadata: {
          display_phone_number: '5511999999999',
          phone_number_id: 'MOCK-PHONE-ID-FOR-TESTING',
        },
        messages: [{
          from: SYNTHETIC_VALUES.phone,
          id: 'msg-synthetic-005',
          timestamp: '1234567890',
          type: 'text',
          text: { body: 'Olá, preciso de ajuda com meu caso' },
        }],
      },
      field: 'messages',
    }],
  }],
};

module.exports = {
  WEBHOOK_CONSENT_ACCEPT_1,
  WEBHOOK_CONSENT_ACCEPT_ACEITO,
  WEBHOOK_CONSENT_REJECT_2,
  WEBHOOK_CONSENT_REJECT_REVOGO,
  WEBHOOK_SIMPLE_MESSAGE,
};
