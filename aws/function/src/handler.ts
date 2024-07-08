/**
 * @file
 * @see {@link https://github.com/aws/aws-lambda-nodejs-runtime-interface-client/blob/9af681895d0cdd2094ef452342a604e94dc82cc3/src/UserFunction.js}
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export async function handlerLoad(handler: string) {
  const { moduleSpec, properties } = handlerRead(handler);
  const module = await loadModule(moduleSpec);
  return getNested(module, properties);
}

interface Handler {
  moduleSpec: string;
  properties: string[];
}

function handlerRead(handler: string): Handler {
  const [moduleSpec, ...properties] = handler.split(".");
  return { moduleSpec, properties };
}

function loadModule(spec: string) {
  const base = join(process.cwd(), spec);

  if (existsSync(base)) {
    return require(base);
  }

  let path = `${base}.js`;
  if (existsSync(path)) {
    for (
      let dirPath = dirname(base);
      dirPath !== "/";
      dirPath = dirname(dirPath)
    ) {
      const manifestPath = join(dirPath, "package.json");
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
        if (manifest.type === "module") {
          return import(path);
        }
        break;
      }
    }
    return require(path);
  }

  path = `${base}.cjs`;
  if (existsSync(path)) {
    return require(path);
  }

  path = `${base}.mjs`;
  if (existsSync(path)) {
    return import(path);
  }

  throw new Error(`Could not find module ${spec}`);
}

function getNested(value: any, properties: string[]) {
  return properties.reduce((module, property) => module[property], value);
}
