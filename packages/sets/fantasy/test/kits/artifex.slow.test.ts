import { kitSuite } from '@pimpampum/playtest/vitest';
import { KNOWN, KNOWN_BLIND } from './known.js';
import { KIT_GAMES, SET, WAITS_FOR } from './suite.js';

kitSuite({ set: SET, kit: 'artifex', games: KIT_GAMES, known: KNOWN['artifex'], knownBlind: KNOWN_BLIND['artifex'], waitsFor: WAITS_FOR });
