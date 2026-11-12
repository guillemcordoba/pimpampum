import { kitSuite } from '@pimpampum/playtest/vitest';
import { KNOWN, KNOWN_BLIND } from './known.js';
import { KIT_GAMES, SET, WAITS_FOR } from './suite.js';

kitSuite({ set: SET, kit: 'mestre-armes', games: KIT_GAMES, known: KNOWN['mestre-armes'], knownBlind: KNOWN_BLIND['mestre-armes'], waitsFor: WAITS_FOR });
