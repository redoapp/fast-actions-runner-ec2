import { CdkStack } from "@redotech/cdk-util/construct";
import { Context, Namespace } from "@redotech/cdk-util/context";
import { App, DefaultStackSynthesizer } from "aws-cdk-lib/core";
import { basicStack } from "./basic";

const app = new App({
  defaultStackSynthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});
basicStack(
  new Context(
    new CdkStack(app, "Basic"),
    Namespace.EMPTY.child("FastGithubEc2Runner"),
  ),
);
