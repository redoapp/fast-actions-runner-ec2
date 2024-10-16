import { stringSetAttributeFormat } from "@redotech/dynamodb/attribute";

import { DynamoDBClient, paginateQuery } from "@aws-sdk/client-dynamodb";
import { stringAttributeFormat } from "@redotech/dynamodb/attribute";

export interface ProvisionerCandidate {
  id: string;
  repoName?: string;
  labelNames: Set<string>;
}

export interface JobAspect {
  repoName: string;
  labelNames: string[];
}

export function provisionerMatches(
  provisioner: ProvisionerCandidate,
  job: JobAspect,
) {
  return (
    (!provisioner.repoName || provisioner.repoName === job.repoName) &&
    job.labelNames.every((label) => provisioner.labelNames.has(label))
  );
}

export async function* provisionerCandidates({
  dynamodbClient,
  owner,
  provisionerTableName,
}: {
  dynamodbClient: DynamoDBClient;
  owner: string;
  provisionerTableName: string;
}): AsyncIterableIterator<ProvisionerCandidate> {
  for await (const output of paginateQuery(
    { client: dynamodbClient },
    {
      ExpressionAttributeNames: { "#owner": "Owner" },
      ExpressionAttributeValues: {
        ":owner": stringAttributeFormat.write(owner),
      },
      IndexName: "Owner",
      KeyConditionExpression: "#owner = :owner",
      ProjectionExpression: "Labels, Id, RepoName",
      TableName: provisionerTableName,
    },
  )) {
    for (const item of output.Items!) {
      yield {
        id: stringAttributeFormat.read(item.Id),
        labelNames: stringSetAttributeFormat.read(item.Labels),
        repoName: item.RepoName && stringAttributeFormat.read(item.RepoName),
      };
    }
  }
}
