export function findActiveSessionId(sessions, botStates, userId) {
  for (const [sid, id] of sessions) if (id === userId && botStates.get(userId) === true) return sid;
  return null;
}
