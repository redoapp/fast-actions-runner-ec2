export function launchTemplateResourceRead(resource: string): {
  launchTemplate: string;
} {
  const prefix = "launch-template/";
  if (!resource.startsWith(prefix)) {
    throw new Error(`Invalid launch template resource: ${resource}`);
  }
  return { launchTemplate: resource.slice(prefix.length) };
}
