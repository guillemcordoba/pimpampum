/**
 * INSTALL THE SET UNDER TEST, once per test process.
 *
 * `@pimpampum/bench` takes its content as a parameter and refuses to guess: ask
 * it to measure anything before a `useSet()` and it throws, by design. That is
 * the safety property — no harness can quietly measure default content — and
 * the price is that every entry point has to say which set it means.
 *
 * For this package the answer is always the fantasy set, so it is said here
 * rather than at the top of thirty test files. A set-specific suite lives in
 * `packages/sets/<set>/` and installs its own.
 */
import { useSet } from '@pimpampum/bench';
import { FANTASY } from '@pimpampum/set-fantasy';

useSet(FANTASY);
