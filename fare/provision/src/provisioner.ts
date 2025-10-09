import { stringSetAttributeCodec } from "@redotech/dynamodb/attribute";

import { DynamoDBClient, paginateQuery } from "@aws-sdk/client-dynamodb";
import { stringAttributeCodec } from "@redotech/dynamodb/attribute";

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
        ":owner": stringAttributeCodec.write(owner),
      },
      IndexName: "Owner",
      KeyConditionExpression: "#owner = :owner",
      ProjectionExpression: "Labels, Id, RepoName",
      TableName: provisionerTableName,
    },
  )) {
    for (const item of output.Items!) {
      yield {
        id: stringAttributeCodec.read(item.Id),
        labelNames: stringSetAttributeCodec.read(item.Labels),
        repoName: item.RepoName && stringAttributeCodec.read(item.RepoName),
      };
    }
  }
}
