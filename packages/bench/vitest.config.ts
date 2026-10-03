import { defineProject } from 'vitest/config';
import { tiers } from '../../vitest.shared.js';

export default defineProject(tiers('bench', { setupFiles: ['./test/setup.ts'] }));
