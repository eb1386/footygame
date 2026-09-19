// Next.js resolves extensionless TypeScript imports; plain Node does not. This hook lets the
// test runner load the same source files the app uses, without a build step.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    const base = new URL(specifier, context.parentURL);
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      const candidate = new URL(base.href + ext);
      if (fs.existsSync(candidate)) return nextResolve(specifier + ext, context);
    }
  }
  return nextResolve(specifier, context);
}

if (process.env.__REGISTER_RESOLVER !== '0') {
  register(pathToFileURL(new URL(import.meta.url).pathname), { parentURL: import.meta.url });
}
