export function findActiveSessionId(sessions, botStates, userId) {
  for (const [sid, id] of sessions) if (id === userId && botStates.get(sid) === true) return sid;
  return null;
}
