export function getErrorMessage(error, fallback = 'Erro inesperado. Tente novamente.') {
  if (!error) return fallback;

  if (error?.response?.data?.error) {
    return String(error.response.data.error);
  }

  if (error?.response?.data?.message) {
    return String(error.response.data.message);
  }

  if (error?.message && typeof error.message === 'string' && error.message.length < 120) {
    const msg = error.message;
    if (!msg.includes('://') && !msg.includes('token') && !msg.includes('stack')) {
      return msg;
    }
  }

  return fallback;
}
