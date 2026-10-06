import { kitSuite } from '@pimpampum/playtest/vitest';
import { KNOWN, KNOWN_BLIND } from './known.js';
import { KIT_GAMES, SET } from './suite.js';

kitSuite({ set: SET, kit: 'airbender', games: KIT_GAMES, known: KNOWN['airbender'], knownBlind: KNOWN_BLIND['airbender'] });
