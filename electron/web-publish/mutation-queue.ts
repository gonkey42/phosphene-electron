let tail: Promise<unknown> = Promise.resolve();

export async function enqueueWebPublishMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = tail.then(operation, operation);
  tail = run.catch(() => undefined);
  return run;
}
