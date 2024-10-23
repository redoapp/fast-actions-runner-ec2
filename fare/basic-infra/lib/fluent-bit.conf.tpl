[INPUT]
    Name systemd
    Systemd_Filter _SYSTEMD_UNIT=actions-runner.service
    Systemd_Filter _SYSTEMD_UNIT=actions-runner-config.service
    Systemd_Filter _SYSTEMD_UNIT=fare-create.service
    Tag systemd.*

[FILTER]
    Name record_modifier
    Match *
    Record ProvisionerId ${ProvisionerId}

[FILTER]
    Name aws
    Match *
    account_id true
    ami_id true
    az true
    ec2_instance_id true
    hostname true
    tags_enabled true
    vpc_id true

[OUTPUT]
    Name cloudwatch_logs
    Match *
    auto_create_group On
    log_group_name ${Name}
    log_group_template ${Name}/$SYSLOG_IDENTIFIER
    log_stream_name instance
    log_stream_template $ec2_instance_id
    region ${AwsRegion}
