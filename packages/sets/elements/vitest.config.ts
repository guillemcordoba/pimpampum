import { defineProject } from 'vitest/config';
import { tiers } from '../../../vitest.shared.js';

export default defineProject(tiers('set-elements', { setupFiles: ['./test/setup.ts'] }));
