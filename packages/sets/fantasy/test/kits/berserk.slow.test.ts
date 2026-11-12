import { kitSuite } from '@pimpampum/playtest/vitest';
import { KNOWN, KNOWN_BLIND } from './known.js';
import { KIT_GAMES, SET, WAITS_FOR } from './suite.js';

kitSuite({ set: SET, kit: 'berserk', games: KIT_GAMES, known: KNOWN['berserk'], knownBlind: KNOWN_BLIND['berserk'], waitsFor: WAITS_FOR });
