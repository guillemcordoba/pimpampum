import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 600_000,
    // The balancer guards run whole encounters synchronously — thousands of
    // combats without ever yielding — so a worker can sit blocked for seconds
    // and miss the reporter's `onTaskUpdate` RPC, which vitest reports as an
    // unhandled error (and fails the run) even when every test passed. Running
    // in the main process removes the RPC entirely.
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
    fileParallelism: false,
  },
});
