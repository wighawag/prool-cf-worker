import { createServer, defineInstance } from "prool";
import { execa } from "prool/processes";
import { toArgs } from "./utils/index.js";

const stripAnsi = (str: string) => str.replace(/\x1B[[(?);]{0,2}(;?\d)*./g, "");

type BinaryParameters = {
  /* command to use to launch, default to `wrangler dev` */
  binary?: string;
};

export type WranglerDevParameters = BinaryParameters & {
  /** Name of the worker */
  name?: string;

  /** Date to use for compatibility checks */
  compatibilityDate?: string;

  /** Flags to use for compatibility checks */
  compatibilityFlags?: string[];

  /** Use the latest version of the worker runtime */
  latest?: boolean;

  /** Static assets to be served. Replaces Workers Sites. */
  assets?: string;

  /** Skip internal build steps and directly deploy script */
  noBundle?: boolean;

  /** IP address to listen on */
  ip?: string;

  /** Port to listen on */
  port?: number;

  /** Port for devtools to connect to */
  inspectorPort?: number;

  /** Routes to upload */
  routes?: string[];

  /** Host to forward requests to, defaults to the zone of project */
  host?: string;

  /** Protocol to listen to requests on, defaults to http. */
  localProtocol?: "http" | "https";

  /** Path to a custom certificate key */
  httpsKeyPath?: string;

  /** Path to a custom certificate */
  httpsCertPath?: string;

  /** Host to act as origin in local mode, defaults to dev.host or route */
  localUpstream?: string;

  /** Protocol to forward requests to host on, defaults to https. */
  upstreamProtocol?: "http" | "https";

  /** A key-value pair to be injected into the script as a variable */
  var?: string[];

  /** A key-value pair to be substituted in the script */
  define?: string[];

  /** A module pair to be substituted in the script */
  alias?: string[];

  /** The function that is called for each JSX element */
  jsxFactory?: string;

  /** The function that is called for each JSX fragment */
  jsxFragment?: string;

  /** Path to a custom tsconfig.json file */
  tsconfig?: string;

  /** Run on the global Cloudflare network with access to production resources */
  remote?: boolean;

  /** Minify the script */
  minify?: boolean;

  /** Enable Node.js compatibility */
  nodeCompat?: boolean;

  /** Specify directory to use for local persistence (defaults to .wrangler/state) */
  persistTo?: string;

  /** Auto reload HTML pages when change is detected in local mode */
  liveReload?: boolean;

  /** Test scheduled events by visiting /__scheduled in browser */
  testScheduled?: boolean;

  /** Specify logging level */
  logLevel?: "debug" | "info" | "log" | "warn" | "error" | "none";

  /** Show interactive dev session (defaults to true if the terminal supports interactivity) */
  showInteractiveDevSession?: boolean;

  /** Use the experimental DevEnv instantiation (unified across wrangler dev and unstable_dev) */
  experimentalDevEnv?: boolean;

  /** Use the experimental file based dev registry for multi-worker development */
  experimentalRegistry?: boolean;
};
export const wranglerDev = defineInstance(
  (parameters: WranglerDevParameters) => {
    const { binary = "pnpm", ...args } = parameters || {};

    const name = "wrangler";
    const process = execa({ name });

    return {
      _internal: {
        args,
        get process() {
          return process._internal.process;
        },
      },
      host: args.host ?? "localhost",
      name,
      port: args.port ?? 8787,
      async start({ port = args.port }, options) {
        const [actualBinary, ...moreArgs] = binary.split(" ");
        const argsList = toArgs({ ...args, port });
        const commandArgs = moreArgs.concat(argsList);

        // console.log(`EXECUTING: ${actualBinary} ${commandArgs.join(" ")}`);
        return await process.start(($) => $`${actualBinary} ${commandArgs}`, {
          ...options,
          // Resolve when the process is listening via a "Listening on" message.
          resolver({ process, reject, resolve }) {
            process.stdout.on("data", (data: any) => {
              // console.log(`DATA`, data.toString());
              const message = stripAnsi(data.toString());
              if (message.includes("Ready on")) {
                // console.log("DONE");
                resolve();
              }
            });

            process.stderr.on("data", (err: any) => {
              // console.log("REJECT", err);
              reject(err);
            });

            process.then(() => {
              // console.log("DEAD?");
            });
          },
        });
      },
      async stop() {
        await process.stop();
      },
    };
  }
);

export function createWranglerDevServer(parameters: {
  binary?: string;
  poolId: number;
  port?: number;
  host?: string;
}) {
  const port = parameters.port || 8787;
  const rpcUrl = {
    http: `${parameters.host || "http://127.0.0.1"}:${port}/${parameters.poolId}`,
  } as const;

  return {
    async restart() {
      await fetch(`${rpcUrl.http}/restart`);
    },
    async start() {
      return await createServer({
        instance: wranglerDev({ binary: parameters.binary }),
        port,
      }).start();
    },
  } as const;
}
