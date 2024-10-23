{
  "agent": { "run_as_user": "cwagent" },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/cloud-init.log",
            "log_group_name": "${Name}/cloud-init",
            "log_stream_name": "{instance_id}",
            "retention_in_days": 3
          },
          {
            "file_path": "/var/log/cloud-init-output.log",
            "log_group_name": "${Name}/cloud-init-output",
            "log_stream_name": "{instance_id}",
            "retention_in_days": 3
          }
        ]
      }
    }
  },
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
