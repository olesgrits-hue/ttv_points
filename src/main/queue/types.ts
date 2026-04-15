import { Slot } from '../store/types';

/** A Twitch Channel Points redemption event as it enters the queue. */
export interface RedemptionEvent {
  /** Redemption ID — used for fulfill/cancel API calls. */
  id: string;
  rewardId: string;
  rewardTitle: string;
  userLogin: string;
  userDisplayName: string;
  redeemedAt: string; // ISO 8601
}

/** Interface every action handler must satisfy. */
export interface ActionHandler {
  execute(slot: Slot, redemption: RedemptionEvent): Promise<void>;
}
