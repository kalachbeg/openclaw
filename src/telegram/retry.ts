interface RetryOptions {
  attempts?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const minDelayMs = options.minDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 10000;
  const backoffMultiplier = options.backoffMultiplier ?? 2;

  let lastError: Error | null = null;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (i < attempts - 1) {
        const delayMs = Math.min(
          minDelayMs * Math.pow(backoffMultiplier, i),
          maxDelayMs,
        );
        const jitteredDelay = delayMs * (0.5 + Math.random() * 0.5);
        await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
      }
    }
  }

  throw lastError;
}

