export function evaluateRiskLimits(positions = [], dailyPnl = 0, balance = {}, policy = {}) {
  const openPositions = positions.filter(position => Number(position.positionAmt) !== 0).length;
  const maxOpenPositions = Number(policy.maxOpenPositions);
  const availableBalance = Number(balance.availableBalance);
  const maxDailyLoss = availableBalance * Number(policy.maxDailyLoss) / 100;
  if (!Number.isFinite(openPositions) || !Number.isFinite(maxOpenPositions) || !Number.isFinite(dailyPnl) || !Number.isFinite(maxDailyLoss) || maxOpenPositions < 0 || maxDailyLoss < 0) return { status: 'REJECTED_INVALID_RISK_STATE' };
  if (openPositions >= maxOpenPositions) return { status: 'REJECTED_MAX_OPEN_POSITIONS', openPositions, maxOpenPositions };
  if (dailyPnl <= -maxDailyLoss) return { status: 'REJECTED_MAX_DAILY_LOSS', dailyPnl, maxDailyLoss };
  return { status: 'ALLOWED', openPositions, maxOpenPositions, dailyPnl, maxDailyLoss };
}
