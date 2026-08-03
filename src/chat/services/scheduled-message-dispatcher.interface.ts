export interface IScheduledMessageDispatcher {
  dispatchDueMessages(): Promise<number>;
  cancelScheduled(scheduledMessageId: number): Promise<boolean>;
}
