import { defineConfig } from 'vitest/config';

/** Every package carries its own `vitest.config.ts` (see `vitest.shared.ts`);
 *  this runs them all as one suite. `--project <name>` narrows it. */
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'packages/sets/*/vitest.config.ts'],
  },
});
