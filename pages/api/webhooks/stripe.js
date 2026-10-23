import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/auth';
import logger from '@/lib/logger';

export const config = {
  api: { bodyParser: false }
};

const SIGNATURE_TOLERANCE_SECONDS = 300;

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function verifyStripeSignature(rawPayload, signatureHeader, secret) {
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(',').map((part) => part.split('='));
  const timestamp = parts.find(([k]) => k === 't')?.[1];
  const signature = parts.find(([k]) => k === 'v1')?.[1];

  if (!timestamp || !signature) return false;

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawPayload}`, 'utf8')
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const signatureBuffer = Buffer.from(signature, 'utf8');
  if (expectedBuffer.length !== signatureBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

function unixToIso(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

async function upsertFromCheckoutSession(session) {
  const officeId = session.metadata?.office_id || session.client_reference_id;
  if (!officeId) {
    logger('warn', 'STRIPE_WEBHOOK_NO_OFFICE', { eventType: 'checkout.session.completed' });
    return;
  }

  const plan = session.metadata?.plan || 'basico';
  const payload = {
    office_id: officeId,
    plan,
    status: 'active',
    stripe_customer_id: session.customer || null,
    stripe_subscription_id: session.subscription || null,
    cancel_at_period_end: false,
    updated_at: new Date().toISOString()
  };

  const { data: existing, error: findError } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('office_id', officeId)
    .limit(1)
    .maybeSingle();

  if (findError) {
    logger('error', 'STRIPE_WEBHOOK_FIND_ERROR', { eventType: 'checkout.session.completed' });
    throw findError;
  }

  let writeError;
  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update(payload)
      .eq('id', existing.id);
    writeError = error;
  } else {
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .insert(payload);
    writeError = error;
  }

  if (writeError) {
    logger('error', 'STRIPE_WEBHOOK_UPSERT_ERROR', { eventType: 'checkout.session.completed' });
    throw writeError;
  }

  if (plan) {
    await supabaseAdmin
      .from('offices')
      .update({ plan, status: 'active', updated_at: new Date().toISOString() })
      .eq('id', officeId);
  }
}

async function updateFromSubscription(subscription, deleted = false) {
  if (!subscription?.id) return;

  const update = {
    status: deleted ? 'cancelled' : (subscription.status || 'active'),
    cancel_at_period_end: !!subscription.cancel_at_period_end,
    current_period_start: unixToIso(subscription.current_period_start),
    current_period_end: unixToIso(subscription.current_period_end),
    updated_at: new Date().toISOString()
  };

  if (deleted) {
    update.cancel_at_period_end = false;
  }

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .update(update)
    .eq('stripe_subscription_id', subscription.id)
    .select();

  if (error) {
    logger('error', 'STRIPE_WEBHOOK_UPDATE_ERROR', { eventType: deleted ? 'customer.subscription.deleted' : 'customer.subscription.updated' });
    throw error;
  }

  // Atualiza plano/status do escritorio vinculado
  const plan = subscription.metadata?.plan;
  const officeId = data?.[0]?.office_id || subscription.metadata?.office_id;
  if (officeId) {
    const officeUpdate = { updated_at: new Date().toISOString() };
    if (deleted) {
      officeUpdate.status = 'active';
    }
    if (plan && !deleted) {
      officeUpdate.plan = plan;
    }
    await supabaseAdmin.from('offices').update(officeUpdate).eq('id', officeId);
  }
}

async function handler(req, res) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    // Lê corpo bruto (bodyParser desativado); aceita body ja parseado em testes
    let rawBody;
    let event;

    if (req.body && typeof req.body === 'object') {
      rawBody = JSON.stringify(req.body);
      event = req.body;
    } else {
      const buffer = await readRawBody(req);
      rawBody = buffer.toString('utf8');
      event = JSON.parse(rawBody);
    }

    // Verificacao de assinatura obrigatoria quando o secret esta configurado
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signatureHeader = req.headers['stripe-signature'];
      if (!verifyStripeSignature(rawBody, signatureHeader, webhookSecret)) {
        logger('warn', 'STRIPE_WEBHOOK_INVALID_SIGNATURE', {});
        return res.status(400).json({ error: 'Assinatura inválida' });
      }
    } else {
      logger('warn', 'STRIPE_WEBHOOK_NO_SECRET', { note: 'STRIPE_WEBHOOK_SECRET ausente; processando sem verificacao (modo dev)' });
    }

    const eventType = event?.type;
    const object = event?.data?.object;

    switch (eventType) {
      case 'checkout.session.completed':
        await upsertFromCheckoutSession(object);
        break;
      case 'customer.subscription.updated':
        await updateFromSubscription(object, false);
        break;
      case 'customer.subscription.deleted':
        await updateFromSubscription(object, true);
        break;
      default:
        logger('info', 'STRIPE_WEBHOOK_IGNORED', { eventType });
        break;
    }

    return res.status(200).json({ received: true, type: eventType || null });
  } catch (error) {
    logger('error', 'STRIPE_WEBHOOK_ERROR', { httpStatus: 500 });
    return res.status(500).json({ error: 'Erro ao processar webhook' });
  }
}

export default handler;
