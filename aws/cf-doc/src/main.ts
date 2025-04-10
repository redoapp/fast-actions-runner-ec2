import { ArgumentParser } from "argparse";
import { readFile } from "fs/promises";
import { parse } from "yaml";

(async () => {
  const parser = new ArgumentParser();
  parser.add_argument("--input", {
    action: "append",
    metavar: "NAME PATH",
    nargs: 2,
  });
  parser.add_argument("--name", { required: true });
  const args = parser.parse_args();

  console.log(`# ${args.name}`);
  console.log();

  for (const [name, path] of args.input) {
    const input = await readFile(path, "utf8");
    templateToMarkdown(name, parse(input));
  }
})().catch((e) => {
  console.error(String(e?.stack ?? e));
  process.exit(1);
});

function templateToMarkdown(name: string, template: any) {
  console.log(`## ${name}`);
  console.log();

  if (Object.keys(template.Parameters ?? {}).length) {
    console.log("### Parameters");
    console.log();

    const parameters = { ...template.Parameters };
    const parameterLabels =
      template.Metadata?.["AWS::CloudFormation::Interface"]?.[
        "ParameterLabels"
      ] ?? {};
    const groups =
      template.Metadata?.["AWS::CloudFormation::Interface"]?.[
        "ParameterGroups"
      ] ?? [];
    for (const group of groups) {
      console.log(`#### ${group.Label.default}`);
      console.log();
      console.log("| ID | Name | Description | Default |");
      console.log("| -- | -- | -- | -- |");
      for (const id of group.Parameters) {
        const parameter = parameters[id];
        delete parameters[id];
        const name = parameterLabels[id]?.default ?? id;
        const type = parameter.Type;
        const default_ = parameter.Default;
        console.log(
          `| ${id} | ${name} | ${type} | ${default_ !== undefined ? `\`${JSON.stringify(default_)}\`` : ""} |`,
        );
      }
      console.log();
    }
    if (Object.keys(groups).length) {
      console.log("#### Other");
      console.log();
    }
    console.log("| ID | Name | Description | Default |");
    console.log("| -- | -- | -- | -- |");
    for (const [id, parameter] of Object.entries(parameters) as [
      string,
      any,
    ][]) {
      const name = parameterLabels[id]?.default ?? id;
      const type = parameter.Type;
      const default_ = parameter.Default;
      console.log(
        `| ${id} | ${name} | ${type} | ${default_ !== undefined ? `\`${JSON.stringify(default_)}\`` : ""} |`,
      );
    }
    console.log();
  }

  if (Object.keys(template.Outputs ?? {}).length) {
    console.log("### Outputs");
    console.log();

    console.log("| ID | Description |");
    console.log("| -- | -- |");
    for (const [id, output] of Object.entries(template.Outputs) as [
      string,
      any,
    ][]) {
      console.log(`| ${id} | ${output.Description} |`);
    }
    console.log();
  }
}
