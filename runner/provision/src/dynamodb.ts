export function tableResourceRead(resource: string): { table: string } {
  const prefix = "table/";
  if (!resource.startsWith(prefix)) {
    throw new Error(`Invalid table resource: ${resource}`);
  }
  return { table: resource.slice(prefix.length) };
}
