import { kitSuite } from '@pimpampum/playtest/vitest';
import { KNOWN, KNOWN_BLIND } from './known.js';
import { KIT_GAMES, SET } from './suite.js';

kitSuite({ set: SET, kit: 'chi-blocker', games: KIT_GAMES, known: KNOWN['chi-blocker'], knownBlind: KNOWN_BLIND['chi-blocker'] });
