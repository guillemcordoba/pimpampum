/**
 * Install this set before anything measures. `@pimpampum/bench` takes its
 * content as a parameter and throws rather than guess, so every process that
 * measures has to say which set it means — for this package's tests, this one.
 */
import { useSet } from '@pimpampum/bench';
import { FANTASY } from '../src/bench/index.js';

useSet(FANTASY);
