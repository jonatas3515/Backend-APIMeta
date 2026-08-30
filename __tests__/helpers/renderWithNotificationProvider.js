/**
 * Helper de renderização com NotificationProvider para testes legados.
 * Não contém dados reais, PII, token ou segredos.
 */

import React from 'react';
import { render as rtlRender, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { NotificationProvider } from '../../components/NotificationProvider';

export const mockAuthHeaders = {
  Authorization: 'Bearer test-token',
  'Content-Type': 'application/json'
};

export function renderWithNotifications(ui, options = {}) {
  const { providerProps, ...rest } = options;
  return rtlRender(
    <NotificationProvider {...providerProps}>{ui}</NotificationProvider>,
    rest
  );
}

export { screen, waitFor, act, fireEvent };

export function createSuccessResponse(data) {
  return { ok: true, status: 200, json: async () => data };
}

export function create429Response(retryAfter = '3') {
  return {
    ok: false,
    status: 429,
    headers: { get: (key) => (key === 'Retry-After' ? String(retryAfter) : null) },
    json: async () => ({})
  };
}

export function create401Response() {
  return { ok: false, status: 401, json: async () => ({}) };
}

export function create403Response() {
  return { ok: false, status: 403, json: async () => ({}) };
}

export function create500Response() {
  return { ok: false, status: 500, json: async () => ({ error: 'Internal server error' }) };
}

export function createNetworkError() {
  return new Error('Network error');
}
