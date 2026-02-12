import type { SubsystemLogger } from "../logging.js";

export enum State {
  Closed = "closed",
  Open = "open",
  HalfOpen = "half-open",
}

interface CircuitOpts {
  failures?: number;
  timeout?: number;
  onOpen?: () => void;
  onHalfOpen?: () => void;
  onClose?: () => void;
}

export class Circuit {
  private state = State.Closed;
  private failureCount = 0;
  private successCount = 0;
  private logger: SubsystemLogger;
  private opts: Required<CircuitOpts>;
  private stateTimer: NodeJS.Timeout | null = null;

  constructor(logger: SubsystemLogger, opts: CircuitOpts = {}) {
    this.logger = logger;
    this.opts = {
      failures: opts.failures ?? 5,
      timeout: opts.timeout ?? 30000,
      onOpen: opts.onOpen ?? (() => {}),
      onHalfOpen: opts.onHalfOpen ?? (() => {}),
      onClose: opts.onClose ?? (() => {}),
    };
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === State.Open) {
      throw new Error("circuit open");
    }

    try {
      const result = await fn();

      if (this.state === State.HalfOpen) {
        this.successCount++;
        if (this.successCount >= 2) {
          this.close();
        }
      } else {
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.logger.warn(`Circuit failure (${this.failureCount}/${this.opts.failures})`);

      if (this.failureCount >= this.opts.failures) {
        this.open();
      }

      throw error;
    }
  }

  private open(): void {
    if (this.state === State.Open) return;

    this.state = State.Open;
    this.logger.error("Circuit opened");
    this.opts.onOpen();

    this.stateTimer = setTimeout(() => {
      this.halfOpen();
    }, this.opts.timeout);
  }

  private halfOpen(): void {
    if (this.state === State.Open) {
      this.state = State.HalfOpen;
      this.successCount = 0;
      this.failureCount = 0;
      this.logger.info("Circuit half-open");
      this.opts.onHalfOpen();
    }
  }

  private close(): void {
    if (this.state === State.Closed) return;

    this.state = State.Closed;
    this.failureCount = 0;
    this.successCount = 0;
    this.logger.info("Circuit closed");
    this.opts.onClose();

    if (this.stateTimer) {
      clearTimeout(this.stateTimer);
      this.stateTimer = null;
    }
  }

  getState(): State {
    return this.state;
  }
}

