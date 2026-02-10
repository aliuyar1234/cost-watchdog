import { terminateAllSessions } from '../sessions.js';
import { invalidateAllFamiliesForUser } from '../token-rotation.js';
import { GDPR_DELETION_TOKEN_REASON } from './constants.js';

export async function terminateUserSessions(userId: string): Promise<number> {
  const terminatedSessions = await terminateAllSessions(userId);
  await invalidateAllFamiliesForUser(userId, GDPR_DELETION_TOKEN_REASON);
  return terminatedSessions;
}
