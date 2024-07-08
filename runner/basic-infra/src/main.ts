import { CdkStack } from "@redotech/cdk-util/construct";
import { App, DefaultStackSynthesizer } from "aws-cdk-lib/core";
import { clusterTemplate } from "./cluster";
import { provisionerTemplate } from "./provisioner";

const app = new App({
  defaultStackSynthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});
clusterTemplate(new CdkStack(app, "Cluster"));
provisionerTemplate(new CdkStack(app, "Provisioner"));
