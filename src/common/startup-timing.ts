import { Logger } from '@nestjs/common';
import { performance } from 'node:perf_hooks';

const logger = new Logger('Startup');

export async function measureStartupStep<T>(
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  let failed = false;

  try {
    return await operation();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    const durationMs = performance.now() - startedAt;
    logger.log(
      `${name} .......... ${durationMs.toFixed(1)}ms${failed ? ' (failed)' : ''}`,
    );
  }
}
