import "./polyfill";

import { CdkStack } from "@redotech/cdk-util/construct";
import { App, DefaultStackSynthesizer } from "aws-cdk-lib/core";
import { appTemplate } from "./app";
import { provisionerTemplate } from "./provisioner";

const app = new App({
  defaultStackSynthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});

appTemplate(new CdkStack(app, "App"));
provisionerTemplate(new CdkStack(app, "Provisioner"));
