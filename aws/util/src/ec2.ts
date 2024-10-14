export function launchTemplateResourceRead(resource: string): {
  launchTemplate: string;
} {
  const prefix = "launch-template/";
  if (!resource.startsWith(prefix)) {
    throw new Error(`Invalid launch template resource: ${resource}`);
  }
  return { launchTemplate: resource.slice(prefix.length) };
}

export function instanceResourceRead(resource: string): {
  instanceId: string;
} {
  const prefix = "instance/";
  if (!resource.startsWith(prefix)) {
    throw new Error(`Invalid launch template resource: ${resource}`);
  }
  return { instanceId: resource.slice(prefix.length) };
}

export function instanceResourceWrite({ instanceId }: { instanceId: string }) {
  return `instance/${instanceId}`;
}
