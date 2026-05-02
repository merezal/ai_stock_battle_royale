export interface BotActivityLog {
  logId: number;
  actionType: string;
  actionDetails: Record<string, unknown>;
  result: Record<string, unknown>;
  timestamp: string;
}
