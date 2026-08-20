export default function handler(req, res) {
  console.log('[WEBHOOK-TEST] Rota de teste acessada');
  console.log('[WEBHOOK-TEST] Método:', req.method);
  console.log('[WEBHOOK-TEST] URL:', req.url);
  // console.log('[WEBHOOK-TEST] Headers: [REDACTED]');
  // console.log('[WEBHOOK-TEST] Body: [REDACTED]');

  res.status(200).json({
    success: true,
    message: 'Webhook test route is working',
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString(),
  });
}
