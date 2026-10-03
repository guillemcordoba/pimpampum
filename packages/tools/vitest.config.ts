import { defineProject } from 'vitest/config';
import { tiers } from '../../vitest.shared.js';

/** Every tools process measures the fantasy set; `test/setup.ts` installs it. */
export default defineProject(tiers('tools', { setupFiles: ['./test/setup.ts'] }));
