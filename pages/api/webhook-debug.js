// Endpoint de debug para ver o último POST recebido
export default async function handler(req, res) {
  return res.status(200).json({
    lastWebhookPost: global.lastWebhookPost || 'Nenhum POST recebido ainda',
    timestamp: new Date().toISOString(),
  });
}
