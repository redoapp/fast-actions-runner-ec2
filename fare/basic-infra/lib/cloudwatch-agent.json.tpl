{
  "agent": { "run_as_user": "cwagent" },
  "metrics": {
    "aggregation_dimensions": [["ProvisionerId"]],
    "append_dimensions": {
      "ImageId": "${!aws:ImageId}",
      "InstanceId": "${!aws:InstanceId}",
      "InstanceType": "${!aws:InstanceType}"
    },
    "metrics_collected": {
      "cpu": {
        "append_dimensions": {
          "ProvisionerId": "${ProvisionerId}"
        },
        "measurement": [
          "usage_active",
          "usage_idle",
          "usage_iowait",
          "usage_system",
          "usage_user"
        ]
      },
      "disk": {
        "append_dimensions": { "ProvisionerId": "${ProvisionerId}" },
        "measurement": ["free", "total", "used", "used_percent"],
        "resources": ["/"]
      },
      "mem": {
        "append_dimensions": { "ProvisionerId": "${ProvisionerId}" },
        "measurement": ["mem_used_percent"],
        "metrics_collection_interval": 60
      },
      "net": {
        "append_dimensions": { "ProvisionerId": "${ProvisionerId}" },
        "measurement": ["bytes_recv", "bytes_sent"]
      },
      "swap": {
        "append_dimensions": { "ProvisionerId": "${ProvisionerId}" },
        "measurement": ["free", "used", "used_percent"]
      }
    },
    "namespace": "${Name}"
  }
}
