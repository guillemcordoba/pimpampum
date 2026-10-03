import { defineProject } from 'vitest/config';
import { tiers } from '../../../vitest.shared.js';

export default defineProject(tiers('set-fantasy', { setupFiles: ['./test/setup.ts'] }));
