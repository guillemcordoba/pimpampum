/**
 * INSTALL THE SET UNDER TEST, once per test process. `@pimpampum/bench` takes
 * its content as a parameter and refuses to guess, so every entry point has to
 * say which set it means — for the tools, the fantasy set.
 */
import { useSet } from '@pimpampum/bench';
import { FANTASY } from '@pimpampum/set-fantasy/bench';

useSet(FANTASY);
