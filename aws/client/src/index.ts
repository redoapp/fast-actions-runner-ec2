export function withClient(client: { destroy(): void }): Disposable {
  return {
    [Symbol.dispose]() {
      client.destroy();
    },
  };
}
