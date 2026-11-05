import handler from './daily-notifications';

export default async function notifyBirthdays(req, res) {
  req.query = { ...req.query, trigger: 'bday' };
  return handler(req, res);
}
