# Development

## Test

```sh
bazel run redotech/test -- init
bazel run redotech/test -- apply -auto-approve
```

## Release

```sh
bazel run fare_publish --embed_label=0.0 --stamp --//aws/artifact:s3_key_prefix=0.0/ -- apply -auto-approve
```
