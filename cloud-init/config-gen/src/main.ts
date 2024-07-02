import { ArgumentParser } from "argparse";
import { readFile } from "node:fs/promises";
import { parse, stringify } from "yaml";

interface Args {
  config: string;
  scripts: string[];
}

const parser = new ArgumentParser({
  prog: "cloud-config-gen",
});
parser.add_argument("scripts", { nargs: "*" });

const args: Args = parser.parse_args();

(async () => {
  const config = parse(await readFile("/dev/stdin", "utf-8"));
  if (!config.runcmd) {
    config.runcmd = [];
  }
  for (const script of args.scripts) {
    config.runcmd.push(["bash", "-c", await readFile(script, "utf-8")]);
  }
  console.log("#cloud-config");
  process.stdout.write(stringify(config));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
