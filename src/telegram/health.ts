import type { Bot } from "grammy";
import type { SubsystemLogger } from "../logging.js";

interface HealthCheckConfig {
  interval?: number;
  timeoutMs?: number;
  failureThreshold?: number;
  onFail?: () => void;
  onRecover?: () => void;
}

interface HealthCheckResult {
  ok: boolean;
  timestamp: number;
  error?: string;
}

export class BotHealthCheck {
  private bot: Bot;
  private logger: SubsystemLogger;
  private config: Required<HealthCheckConfig>;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private failureCount = 0;
  private wasHealthy = true;

  constructor(
    bot: Bot,
    logger: SubsystemLogger,
    config: HealthCheckConfig = {},
  ) {
    this.bot = bot;
    this.logger = logger;
    this.config = {
      interval: config.interval ?? 30000,
      timeoutMs: config.timeoutMs ?? 5000,
      failureThreshold: config.failureThreshold ?? 3,
      onFail: config.onFail ?? (() => {}),
      onRecover: config.onRecover ?? (() => {}),
    };
  }

  async check(): Promise<HealthCheckResult> {
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("health check timeout")), this.config.timeoutMs);
      });

      await Promise.race([
        (async () => {
          const result = await this.bot.api.getMe();
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          return result;
        })(),
        timeoutPromise,
      ]);

      this.failureCount = 0;
      if (!this.wasHealthy) {
        this.wasHealthy = true;
        this.logger.info("Bot health recovered");
        this.config.onRecover();
      }

      return {
        ok: true,
        timestamp: Date.now(),
      };
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      this.failureCount++;
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.logger.warn(`Health check failed (${this.failureCount}/${this.config.failureThreshold}): ${errorMsg}`);

      if (this.failureCount >= this.config.failureThreshold && this.wasHealthy) {
        this.wasHealthy = false;
        this.logger.error("Bot health degraded");
        this.config.onFail();
      }

      return {
        ok: false,
        timestamp: Date.now(),
        error: errorMsg,
      };
    }
  }

  start(): void {
    if (this.healthCheckTimer) return;

    this.logger.info(`Starting health checks (interval: ${this.config.interval}ms)`);
    this.healthCheckTimer = setInterval(async () => {
      await this.check();
    }, this.config.interval);
  }

  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      this.logger.info("Health checks stopped");
    }
  }

  isHealthy(): boolean {
    return this.wasHealthy;
  }
}

