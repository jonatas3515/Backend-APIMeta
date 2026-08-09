// ARQUIVO LEGADO - lógica movida para pages/api/webhook.js
// Este arquivo não usa mais Express para não interferir com as rotas do Next.js

module.exports = (req, res) => {
  res.status(200).json({ message: 'Use /api/webhook via Next.js pages/api' });
};
