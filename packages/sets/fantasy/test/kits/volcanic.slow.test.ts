import { kitSuite } from '@pimpampum/playtest/vitest';
import { KNOWN } from './known.js';
import { KIT_GAMES, SET } from './suite.js';

kitSuite({ set: SET, kit: 'volcanic', games: KIT_GAMES, known: KNOWN['volcanic'] });
