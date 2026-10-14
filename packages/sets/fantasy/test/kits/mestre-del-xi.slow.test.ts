import { kitSuite } from '@pimpampum/playtest/vitest';
import { KNOWN, KNOWN_BLIND } from './known.js';
import { KIT_GAMES, SET } from './suite.js';

kitSuite({ set: SET, kit: 'mestre-del-xi', games: KIT_GAMES, known: KNOWN['mestre-del-xi'], knownBlind: KNOWN_BLIND['mestre-del-xi'] });
