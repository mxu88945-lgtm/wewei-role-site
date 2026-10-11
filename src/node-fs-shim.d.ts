// Minimal typing for the Node fs calls used by stylesheet tests (vitest runs in
// Node, but the app's tsconfig deliberately has no Node globals).
declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string
  export function readdirSync(path: string | URL): string[]
}
