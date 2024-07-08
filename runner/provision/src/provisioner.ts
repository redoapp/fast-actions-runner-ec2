export function labelsMatch(runnerLabels: Set<string>, labels: string[]) {
  return labels.every((label) => runnerLabels.has(label));
}
