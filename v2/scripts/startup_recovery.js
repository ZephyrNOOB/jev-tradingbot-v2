export function selectStartupRecoveryRows(rows = [], botEnabled = false) {
  return rows.filter(row => row.entry_status === 'FILLED' && row.position_status === 'OPEN' && row.candidate_json);
}

export async function runStartupRecovery(rows, recover) {
  await Promise.allSettled(selectStartupRecoveryRows(rows, false).map(row => recover(Number(row.user_id), row)));
}
