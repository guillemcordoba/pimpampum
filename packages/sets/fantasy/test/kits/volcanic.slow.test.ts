import { kitSuite } from '@pimpampum/playtest/vitest';
import { KNOWN, KNOWN_BLIND } from './known.js';
import { KIT_GAMES, SET, WAITS_FOR } from './suite.js';

kitSuite({ set: SET, kit: 'volcanic', games: KIT_GAMES, known: KNOWN['volcanic'], knownBlind: KNOWN_BLIND['volcanic'], waitsFor: WAITS_FOR });
