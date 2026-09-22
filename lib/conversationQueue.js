const conversationQueues = new Map();

export async function withConversationQueue(key, task) {
  const previous = conversationQueues.get(key) || Promise.resolve();
  const next = previous.then(
    () => task(),
    () => task()
  );
  conversationQueues.set(key, next);
  next.finally(() => {
    if (conversationQueues.get(key) === next) {
      conversationQueues.delete(key);
    }
  });
  return next;
}
