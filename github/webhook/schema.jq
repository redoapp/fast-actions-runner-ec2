del(.definitions.repository.required[] | select(. == "custom_properties"))
| del(
  .oneOf[]
  | select(
    .["$ref"] as $ref
    | ["#/definitions/workflow_job_event", "#/definitions/ping$event"]
    | index($ref)
    | not
  )
)
