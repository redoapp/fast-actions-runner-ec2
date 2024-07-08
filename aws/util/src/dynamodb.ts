export function tableResourceRead(resource: string): {
  name: string;
} {
  const prefix = "table/";
  if (!resource.startsWith(prefix)) {
    throw new Error(`Invalid table resource: ${resource}`);
  }
  return { name: resource.slice(prefix.length) };
}
