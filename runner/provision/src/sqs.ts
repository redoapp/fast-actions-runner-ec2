import {
  ChangeMessageVisibilityBatchCommand,
  DeleteMessageBatchCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";

export async function* consumeQueue(
  sqsClient: SQSClient,
  sqsQueueUrl: string,
  batchSize: number = 1,
): AsyncIterableIterator<Message[]> {
  const output = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: sqsQueueUrl,
      MaxNumberOfMessages: batchSize,
    }),
  );
  if (!output.Messages?.length) {
    return;
  }
  let hasError = false;
  try {
    yield output.Messages!;
  } catch (e) {
    hasError = true;
    await sqsClient.send(
      new ChangeMessageVisibilityBatchCommand({
        QueueUrl: sqsQueueUrl,
        Entries: output.Messages!.map((message) => ({
          Id: message.MessageId!,
          ReceiptHandle: message.ReceiptHandle!,
          VisibilityTimeout: 0,
        })),
      }),
    );
    throw e;
  } finally {
    if (!hasError) {
      await sqsClient.send(
        new DeleteMessageBatchCommand({
          QueueUrl: sqsQueueUrl,
          Entries: output.Messages!.map((message) => ({
            Id: message.MessageId!,
            ReceiptHandle: message.ReceiptHandle!,
          })),
        }),
      );
    }
  }
}
