export function queueResourceRead(resource: string): { queueName: string } {
  return { queueName: resource };
}
