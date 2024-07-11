import "./polyfill";

import { BetterStack } from "@redotech/cdk-util/stack";
import { App, DefaultStackSynthesizer } from "aws-cdk-lib/core";
import { appTemplate } from "./app";
import { provisionerTemplate } from "./provisioner";

const app = new App({
  defaultStackSynthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});

appTemplate(new BetterStack(app, "App"));
provisionerTemplate(new BetterStack(app, "Provisioner"));
