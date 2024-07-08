# Fast Actions EC2 Runner

## Architecture

- Jobs - Jobs
- Runner - Runners
- Provisioner - Runner provisioners

### Flows

Webhook (Lambda URL) -> Webhook (Lambda) -> Provision (SQS) -> Provision
(Lambda)

Cron (Event Rule) -> Provision All (Lambda) ->

Cron (Event Rule) -> Sync All (Lambda) -> Sync (Lambda) ->

## Templates

- App
- Same-account runner
- Registration
- Runner
- Preset base
- Preset provisioner

## IAM Policy Document

```json
{
  "Statement": [
    {
      "Action": [
        "ec2:CreateTags",
        "ec2:DescribeInstances",
        "ec2:RunInstances",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:TerminateInstances"
      ],
      "Effect": "Allow",
      "Resource": "*"
    }
  ],
  "Version": "2012-10-17"
}
```
