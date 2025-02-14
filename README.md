# Fast Actions Runner for EC2, aka FARE

An EC2-based self-hosted runner for GitHub Actions.

FARE starts/stops pooled EC2 instances, for quick startup and warm caches.

## Description

This self-hosted runner is cheaper than hosted GitHub Actions runners, and
faster than alternatives.

### Cheaper

At time of writing, GitHub's standard Linux runner is $0.48/hour for private
repos, whereas EC2 m5.large is $0.10/hour. This discount scales to larger
instance sizes as well.

Note that FARE workers incur EBS storage costs, which are $0.08/GB/month. (E.g.
10 workers with 64GB disks are $51/month for storage.)

### Faster

Caches can be very helpful for build performance, but downloading and uploading
distributed caches is slow. And GitHub Actions limits total cache size to
10GB/repository.

Instead, FARE maintains a pool of EC2 intances, and starts or stops them as
necessary.

And instances may be used for multiple runs without restart, amortizing boot
overhead and leveraging OS file caching.

## Usage

### 1. Create controller.

Create a stack from
`https://redotech-fare-artifact.s3.us-east-1.amazonaws.com/<version>/fare-app.template.yaml`

If other AWS accounts will be using the controller, grant
`lambda:InvokeFunction` on the ProvisionerFunctionArn to those accounts.

### 2. Create a GitHub app.

From Step 1, read the SetupUrlFunctionArn output and invoke that Lambda
function.

```sh
aws lambda invoke --function-name FunctionArn /dev/stdout | jq -rs '.[0].url'
```

Open the URL in your browser. You will be prompted to create a GitHub app.
Accept.

### 3. Install the GitHub app.

Install the GitHub app to the necessary organizations or repositories.

### 4. Configure the provisioner(s).

You will need at least one label that will match job labels defined by GitHub
actions. Organizations may create a runner group for to control access to the
runners.

#### Provisioner

Create an EC2 launch template. Then use the Cloudformation template
`https://redotech-fare-artifact.s3.us-east-1.amazonaws.com/<version>/fare-provisioner.template.yaml`.

#### Preset

Or use a preset that creates an EC2 launch template for you:
`https://redotech-fare-artifact.s3.us-east-1.amazonaws.com/<version>/fare-basic-provisioner.template.yaml`.

You might also consider using a preset for creating the VPC, subnet, etc.:
`https://redotech-fare-artifact.s3.us-east-1.amazonaws.com/<version>/fare-basic-cluster.template.yaml`.

## Other

For details, see the [docs](./doc).
