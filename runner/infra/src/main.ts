import { CdkStack } from "@redotech/cdk-util/construct";
import { Context, Namespace } from "@redotech/cdk-util/context";
import { App, DefaultStackSynthesizer } from "aws-cdk-lib/core";
import { runnerStack } from "./runner";

const app = new App({
  defaultStackSynthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});
runnerStack(
  new Context(
    new CdkStack(app, "Runner"),
    Namespace.EMPTY.child("FastGithubEc2Runner"),
  ),
);
