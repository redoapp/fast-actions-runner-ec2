import { RequestError } from "@octokit/request-error";
import { githubJobGet } from "./job.js";

function requestError(status: number) {
  return new RequestError("GitHub request failed", status, {
    request: {
      headers: {},
      method: "GET",
      url: "https://api.github.com/actions/jobs/1",
    },
  });
}

describe("githubJobGet", () => {
  it.each([404, 410])(
    "treats a %i response as a missing job",
    async (status) => {
      await expect(
        githubJobGet(() => Promise.reject(requestError(status))),
      ).resolves.toBeUndefined();
    },
  );

  it("returns an existing job", async () => {
    const job = { id: 1 };

    await expect(githubJobGet(() => Promise.resolve(job))).resolves.toBe(job);
  });

  it("preserves non-terminal GitHub errors", async () => {
    const error = requestError(403);

    await expect(githubJobGet(() => Promise.reject(error))).rejects.toBe(error);
  });
});
