import { kitSuite } from '@pimpampum/playtest/vitest';
import { KNOWN, KNOWN_BLIND } from './known.js';
import { KIT_GAMES, SET } from './suite.js';

kitSuite({ set: SET, kit: 'nigromant', games: KIT_GAMES, known: KNOWN['nigromant'], knownBlind: KNOWN_BLIND['nigromant'] });
