import handler from './daily-notifications';

export default async function notifyEve(req, res) {
  req.query = { ...req.query, trigger: 'eve' };
  return handler(req, res);
}
