# Fast Actions Runner for EC2, aka FARE

An EC2-based self-hosted runner for GitHub Actions.

Emphasizes, ease-of-use, flexibility, and performance.

## Description

This self-hosted runner is cheaper and faster than using hosted GitHub Actions
runners.

### Cheaper

At time of writing, GitHub's standard Linux runner for private repos is
$0.48/hour. EC2 provides the same specs (m5.large) for $0.10/hour. This discount
scales for larger instances as well.

### Faster

Caches can be very helpful for builds performance, but download and uploading
caches over the network is slow.

Instead, FARE maintains a pool of EC2 intances, and starts or stops them as
necessary.

## Usage

### 1. Create Cloudformation stack from the App template.

Create a stack from
`https://redotech-fast-actions-ec2-runner-artifact.s3.us-east-1.amazonaws.com/<version>/fare-app.template.yaml`

### 2. Create a GitHub app.

From Step 1, take the name of the created Lambda function. If you want to create
a personal app, omit the payload.

```sh
aws lambda invoke --function-name Example  --payload'{"organization":"example-org"}'
```

This produces a URL. Open the URL in your browser. You will be prompted to
create a GitHub app. Accept.

### 3. Create Cloudformation stacks from the Provisioner template.

There are multiple ways of doing this.

### 4. Install the GitHub app.
