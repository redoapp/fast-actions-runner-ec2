import { BetterStack } from "@redotech/cdk-util/stack";
import { App, DefaultStackSynthesizer } from "aws-cdk-lib/core";
import { clusterTemplate } from "./cluster";
import { provisionerTemplate } from "./provisioner";

const app = new App({
  defaultStackSynthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});
clusterTemplate(new BetterStack(app, "Cluster"));
provisionerTemplate(new BetterStack(app, "Provisioner"));
