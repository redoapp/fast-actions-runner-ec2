import {
  SQSClient,
  SendMessageBatchCommand,
  SendMessageBatchRequestEntry,
} from "@aws-sdk/client-sqs";
import { queueResourceRead } from "@redotech/aws-util/sqs";
import { envArnRead } from "@redotech/lambda/env";
import { attributesWrite } from "@redotech/lambda/sqs-format";
import { getQueueUrl } from "@redotech/sqs";
import { sqsStringWrite } from "@redotech/sqs/format";
import { SQSHandler, SQSRecord } from "aws-lambda";

const targetQueueArn = envArnRead("TARGET_QUEUE_NAME");

const sqsClient = new SQSClient({ region: targetQueueArn.region });

const { queueName: targetQueueName } = queueResourceRead(
  targetQueueArn.resource,
);

const targetQueueUrl = getQueueUrl(sqsClient, targetQueueName);

export const handler: SQSHandler = async (event) => {
  const entries: SendMessageBatchRequestEntry[] = event.Records.map(
    (record) => ({
      Id: record.messageId,
      MessageBody: record.body,
      MessageAttributes: attributesWrite(record.messageAttributes),
      MessageDeduplicationId: messageDeduplicationId(record),
      MessageGroupId: messageGroupId(record),
      MessageSystemAttributes: {
        AWSTraceHeader: record.attributes.AWSTraceHeader
          ? sqsStringWrite(record.attributes.AWSTraceHeader)
          : undefined,
      },
    }),
  );

  const output = await sqsClient.send(
    new SendMessageBatchCommand({
      QueueUrl: await targetQueueUrl,
      Entries: entries,
    }),
  );

  return {
    batchItemFailures:
      output.Failed?.map((entry) => ({ itemIdentifier: entry.Id! })) ?? [],
  };
};

function messageDeduplicationId(record: SQSRecord): string {
  return (
    record.messageAttributes.MessageDeduplicationId?.stringValue ??
    record.attributes.MessageDeduplicationId ??
    record.messageId
  );
}

function messageGroupId(record: SQSRecord) {
  return (
    record.messageAttributes.MessageGroupId?.stringValue ??
    record.attributes.MessageGroupId ??
    record.messageId
  );
}
