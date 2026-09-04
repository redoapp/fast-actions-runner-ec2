import { RequestError } from "@octokit/request-error";

export async function githubJobGet<T>(
  getJob: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await getJob();
  } catch (error) {
    if (
      error instanceof RequestError &&
      (error.status === 404 || error.status === 410)
    ) {
      return;
    }
    throw error;
  }
}
