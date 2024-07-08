import { GetQueueUrlCommand, SQSClient } from "@aws-sdk/client-sqs";

export async function getQueueUrl(sqsClient: SQSClient, name: string) {
  const output = await sqsClient.send(
    new GetQueueUrlCommand({ QueueName: name }),
  );
  return output.QueueUrl!;
}
