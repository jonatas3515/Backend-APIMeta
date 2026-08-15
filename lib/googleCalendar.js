// ============================================================================
// Serviço Google Calendar - Fase 2
// ============================================================================
// Responsabilidades:
// 1. Obter/renovar access_token válido
// 2. Criar/atualizar/excluir eventos no Google Calendar
// 3. Nunca logar tokens, codes ou segredos
// ============================================================================

import { decrypt, encrypt } from './encryption';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const BUFFER_MINUTES = 5;

async function refreshGoogleToken(refreshToken) {
  const params = new URLSearchParams();
  params.append('client_id', GOOGLE_CLIENT_ID);
  params.append('client_secret', GOOGLE_CLIENT_SECRET);
  params.append('refresh_token', refreshToken);
  params.append('grant_type', 'refresh_token');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Erro ao renovar token do Google');
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in
  };
}

export async function getValidAccessToken(supabaseAdmin, userId, provider = 'google') {
  const { data: integration, error } = await supabaseAdmin
    .from('user_calendar_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single();

  if (error || !integration) {
    throw new Error('Integração não encontrada');
  }

  if (!integration.is_active) {
    throw new Error('Integração desativada');
  }

  const expiresAt = new Date(integration.expires_at);
  const now = new Date();
  const bufferDate = new Date(now.getTime() + BUFFER_MINUTES * 60 * 1000);

  let accessToken;

  if (expiresAt <= bufferDate) {
    // Renova token
    if (!integration.refresh_token_encrypted) {
      throw new Error('Refresh token não disponível');
    }

    const refreshToken = decrypt(integration.refresh_token_encrypted);
    const { access_token, expires_in } = await refreshGoogleToken(refreshToken);
    accessToken = access_token;

    const newExpiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
    const encryptedAccess = encrypt(accessToken);

    const { error: updateError } = await supabaseAdmin
      .from('user_calendar_integrations')
      .update({
        access_token_encrypted: encryptedAccess,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', integration.id);

    if (updateError) {
      console.error('[GOOGLE-CALENDAR] Erro ao salvar token renovado:', updateError);
      // Não joga erro: ainda podemos usar o accessToken
    }
  } else {
    if (!integration.access_token_encrypted) {
      throw new Error('Access token não disponível');
    }
    accessToken = decrypt(integration.access_token_encrypted);
  }

  return { accessToken, integration };
}

export async function markIntegrationInvalid(supabaseAdmin, integrationId, errorMessage) {
  await supabaseAdmin
    .from('user_calendar_integrations')
    .update({
      is_active: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', integrationId);

  // Também atualiza last_sync_error
  await supabaseAdmin
    .from('user_calendar_integrations')
    .update({
      last_sync_error: errorMessage,
      last_sync_at: new Date().toISOString()
    })
    .eq('id', integrationId);
}

function toGoogleDateTime(date, time = null, isAllDay = false) {
  if (isAllDay) {
    const d = new Date(date + 'T00:00:00');
    return {
      date: d.toISOString().split('T')[0]
    };
  }

  const d = new Date(date + 'T' + (time || '00:00:00'));
  return {
    dateTime: d.toISOString(),
    timeZone: 'America/Bahia'
  };
}

export async function createGoogleEvent({ supabaseAdmin, userId, event }) {
  const { accessToken, integration } = await getValidAccessToken(supabaseAdmin, userId, 'google');

  const start = toGoogleDateTime(event.event_date, event.event_time, !event.event_time);
  const end = event.event_time
    ? toGoogleDateTime(event.event_date, event.event_time)
    : toGoogleDateTime(event.event_date, null, true);

  if (event.event_time) {
    // Se tem hora, duração padrão de 1 hora
    const startDate = new Date(start.dateTime);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    end.dateTime = endDate.toISOString();
    end.timeZone = 'America/Bahia';
  } else {
    // Dia inteiro: end é no dia seguinte
    const d = new Date(event.event_date + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    end.date = d.toISOString().split('T')[0];
  }

  const body = {
    summary: event.title || event.description || 'Evento N&C',
    description: event.description || '',
    start,
    end,
    reminders: {
      useDefault: true
    }
  };

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401 || data.error?.code === 401) {
      await markIntegrationInvalid(supabaseAdmin, integration.id, 'Token inválido ou revogado');
    }
    throw new Error(data.error?.message || 'Erro ao criar evento no Google Calendar');
  }

  return { id: data.id, htmlLink: data.htmlLink };
}

export async function updateGoogleEvent({ supabaseAdmin, userId, eventId, event }) {
  const { accessToken } = await getValidAccessToken(supabaseAdmin, userId, 'google');

  const start = toGoogleDateTime(event.event_date, event.event_time, !event.event_time);
  const end = event.event_time
    ? toGoogleDateTime(event.event_date, event.event_time)
    : toGoogleDateTime(event.event_date, null, true);

  if (event.event_time) {
    const startDate = new Date(start.dateTime);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    end.dateTime = endDate.toISOString();
    end.timeZone = 'America/Bahia';
  } else {
    const d = new Date(event.event_date + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    end.date = d.toISOString().split('T')[0];
  }

  const body = {
    summary: event.title || event.description || 'Evento N&C',
    description: event.description || '',
    start,
    end
  };

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Erro ao atualizar evento no Google Calendar');
  }

  return { id: data.id, htmlLink: data.htmlLink };
}

export async function deleteGoogleEvent({ supabaseAdmin, userId, eventId }) {
  const { accessToken } = await getValidAccessToken(supabaseAdmin, userId, 'google');

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok && response.status !== 404) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || 'Erro ao excluir evento no Google Calendar');
  }

  return { success: true };
}
