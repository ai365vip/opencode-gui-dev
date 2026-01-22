import type { ChannelState } from './opencodeAgentTypes';

export class RunningWatchdog {
  private readonly timers = new WeakMap<ChannelState, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly getTimeoutMs: () => number,
    private readonly onTimeout: (state: ChannelState) => void | Promise<void>
  ) {}

  arm(state: ChannelState): void {
    this.disarm(state);

    const timeoutMs = Number(this.getTimeoutMs());
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return;

    this.timers.set(
      state,
      setTimeout(() => {
        void Promise.resolve(this.onTimeout(state));
      }, timeoutMs)
    );
  }

  disarm(state: ChannelState): void {
    const timer = this.timers.get(state);
    if (timer) {
      clearTimeout(timer);
    }
    this.timers.delete(state);
  }
}

