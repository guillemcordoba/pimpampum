/**
 * Minimal ambient declarations for the handful of Node APIs the simulator
 * scripts touch. The package deliberately doesn't depend on @types/node — it
 * is a research harness, not a Node application, and this keeps the surface
 * it can reach small and obvious.
 */
declare module 'node:fs' {
  export function writeFileSync(path: string, data: string): void;
  export function readFileSync(path: string, encoding: string): string;
  export function existsSync(path: string): boolean;
}
