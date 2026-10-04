import { kitSuite } from '@pimpampum/playtest/vitest';
import { KNOWN, KNOWN_BLIND } from './known.js';
import { KIT_GAMES, SET } from './suite.js';

kitSuite({ set: SET, kit: 'enginyer-explosius', games: KIT_GAMES, known: KNOWN['enginyer-explosius'], knownBlind: KNOWN_BLIND['enginyer-explosius'] });
