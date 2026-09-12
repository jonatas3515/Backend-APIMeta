function toISODate(value) {
  const d = new Date(value);
  return d.toISOString().split('T')[0];
}

function safeDate(value) {
  return value ? new Date(value).toISOString() : null;
}

function inRange(date, from, to) {
  if (!date) return false;
  const d = new Date(date).getTime();
  if (from && d < new Date(from).getTime()) return false;
  if (to && d > new Date(to).getTime()) return false;
  return true;
}

export async function computeFunnelWhatsAppMetrics(supabase, filters = {}) {
  const { from, to, conversationId, stage } = filters;

  let messagesQuery = supabase
    .from('messages')
    .select('created_at, direction, conversation_id')
    .order('created_at', { ascending: true });

  if (from) messagesQuery = messagesQuery.gte('created_at', from);
  if (to) messagesQuery = messagesQuery.lte('created_at', to);
  if (conversationId) messagesQuery = messagesQuery.eq('conversation_id', conversationId);

  let convQuery = supabase
    .from('conversations')
    .select('id, funnel_stage, first_contact_at, first_response_at, converted_at, closed_at')
    .order('created_at', { ascending: true });

  if (conversationId) convQuery = convQuery.eq('id', conversationId);

  let historyQuery = supabase
    .from('funnel_history')
    .select('to_stage, created_at, conversation_id')
    .order('created_at', { ascending: true });

  if (from) historyQuery = historyQuery.gte('created_at', from);
  if (to) historyQuery = historyQuery.lte('created_at', to);
  if (conversationId) historyQuery = historyQuery.eq('conversation_id', conversationId);

  const [messagesRes, convRes, historyRes] = await Promise.all([
    messagesQuery,
    convQuery,
    historyQuery
  ]);

  const messages = (messagesRes.data || []).filter(m => m && m.conversation_id);
  const conversations = (convRes.data || []);
  const history = (historyRes.data || []);

  const validConvs = conversations.filter(c =>
    c.first_contact_at && c.first_response_at && inRange(c.first_contact_at, from, to)
  );

  const volumeByDay = {};
  messages.forEach(m => {
    const day = toISODate(m.created_at);
    if (!volumeByDay[day]) volumeByDay[day] = { inbound: 0, outbound: 0 };
    volumeByDay[day][m.direction] += 1;
  });

  const responseTimes = [];
  validConvs.forEach(c => {
    const diff = new Date(c.first_response_at).getTime() - new Date(c.first_contact_at).getTime();
    if (diff >= 0) responseTimes.push(diff);
  });

  const avgResponseSeconds = responseTimes.length
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length / 1000)
    : 0;

  const stageDistribution = {};
  conversations.forEach(c => {
    if (stage && c.funnel_stage !== stage) return;
    stageDistribution[c.funnel_stage] = (stageDistribution[c.funnel_stage] || 0) + 1;
  });

  const eventTypes = ['first_contact', 'qualification', 'proposal_sent', 'negotiation', 'closed', 'lost'];
  const eventDistribution = {};
  history.forEach(h => {
    if (eventTypes.includes(h.to_stage)) {
      eventDistribution[h.to_stage] = (eventDistribution[h.to_stage] || 0) + 1;
    }
  });

  const firstContacts = history.filter(h => h.to_stage === 'first_contact').length;
  const closedCount = history.filter(h => h.to_stage === 'closed').length;
  const conversionRate = firstContacts > 0
    ? Number(((closedCount / firstContacts) * 100).toFixed(2))
    : 0;

  return {
    period: { from: safeDate(from), to: safeDate(to) },
    volumeByDay: Object.keys(volumeByDay).sort().map(day => ({
      date: day,
      inbound: volumeByDay[day].inbound,
      outbound: volumeByDay[day].outbound
    })),
    avgResponseSeconds,
    stageDistribution,
    eventDistribution,
    conversionRate,
    totalConversations: conversations.length,
    totalMessages: messages.length
  };
}
