# Development

## Release

```sh
bazel run redotech/publish/fare_publish --embed_label=0.0 --stamp --//aws/artifact:s3_key_prefix=0.0/ -- apply -auto-approve
```
