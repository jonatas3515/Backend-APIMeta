import handler from './daily-notifications';

export default async function notifyMorning(req, res) {
  req.query = { ...req.query, trigger: 'day' };
  return handler(req, res);
}
