import { createServer, defineInstance } from "prool";
import { setupExeca } from "./execa/index.js";
import { toArgs } from "./utils/index.js";
import { execa } from "execa";

const stripAnsi = (str: string) => str.replace(/\x1B[[(?);]{0,2}(;?\d)*./g, "");

type BinaryParameters = {
  /* command to use to launch, default to `wrangler dev` */
  binary?: string;
  redirectToFile?: string;
  onReadyCommands?: string[];
  onStopCommands?: string[];
  binaryLog?: boolean;
};

type GlobalParameters = {
  /** Experimental: support wrangler.json  */
  experimentalJsonConfig?: boolean;
  /** Path to .toml configuration file */
  config?: string;
  /** Environment to use for operations and .env files */
  env?: string;
};

export type WranglerDevParameters = BinaryParameters &
  GlobalParameters & {
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
    const {
      binary = "pnpm",
      redirectToFile,
      onReadyCommands,
      onStopCommands,
      binaryLog,
      ...args
    } = parameters || {};

    const name = "wrangler";
    const process = setupExeca({
      name,
      redirectToFile: redirectToFile ? { file: redirectToFile } : undefined,
    });

    const portProvided = args.port ?? 8787;

    // This will let us identify the worker and we use the {PORT} as the identifier in the calling context
    // this can be used to use storage for specific instance
    let portAssigned = portProvided;

    return {
      _internal: {
        args,
        get process() {
          return process._internal.process;
        },
      },
      host: args.host ?? "localhost",
      name,
      port: portProvided,
      async start({ port = portProvided }, options) {
        portAssigned = port;
        const [actualBinary, ...moreArgs] = binary.split(" ");
        const argsList = toArgs({ ...args, port }).map((v) =>
          v.replaceAll("{PORT}", portAssigned.toString())
        );
        const commandArgs = moreArgs.concat(argsList);

        if (binaryLog) {
          console.log(`EXECUTING: ${actualBinary} ${commandArgs.join(" ")}`);
        }
        return await process.start(($) => $`${actualBinary} ${commandArgs}`, {
          ...options,
          // Resolve when the process is listening via a "Listening on" message.
          resolver({ process, reject, resolve }) {
            process.stdout.on("data", async (data: any) => {
              // console.log(`DATA ${data.toString()}`);
              const message = stripAnsi(data.toString());
              if (message.includes("Ready on")) {
                if (binaryLog) {
                  console.log("Ready");
                }
                if (onReadyCommands) {
                  const commands = onReadyCommands.map((v) =>
                    v.replaceAll("{PORT}", portAssigned.toString())
                  );
                  if (binaryLog) {
                    console.log("executing onReadyCommands...");
                  }
                  for (const onReadyCommand of commands) {
                    const [bin, ...args] = onReadyCommand.split(" ");
                    try {
                      if (binaryLog) {
                        await execa({
                          stdout: ["pipe", "inherit"],
                          stderr: ["pipe", "inherit"],
                        })`${bin} ${args}`;
                      } else {
                        await execa`${bin} ${args}`;
                      }
                    } catch (err: any) {
                      return reject(err.toString());
                    }
                  }
                }
                if (binaryLog) {
                  console.log("Resolving...");
                }
                resolve();
              }
            });

            process.stderr.on("data", (err: any) => {
              if (binaryLog) {
                console.log(`ERROR ${err.toString()}`);
              }
              reject(err);
            });
          },
        });
      },
      async stop() {
        if (binaryLog) {
          console.log("Stopped");
        }
        if (onStopCommands) {
          const commands = onStopCommands.map((v) =>
            v.replaceAll("{PORT}", portAssigned.toString())
          );
          if (binaryLog) {
            console.log("executing onStopCommands...");
          }
          for (const onStopCommand of commands) {
            const [bin, ...args] = onStopCommand.split(" ");
            try {
              if (binaryLog) {
                await execa({
                  stdout: ["pipe", "inherit"],
                  stderr: ["pipe", "inherit"],
                })`${bin} ${args}`;
              } else {
                await execa`${bin} ${args}`;
              }
            } catch {}
          }
        }
        await process.stop();
      },
    };
  }
);

export function createWranglerDevServer(
  urlWithPoolId: string,
  parameters?: WranglerDevParameters
) {
  const urlObject = new URL(urlWithPoolId);
  const portString = urlObject.port;
  const portAsNumber = parseInt(portString);
  const port = isNaN(portAsNumber) ? 80 : portAsNumber;
  const pathname = urlObject.pathname.slice(1);
  const poolId = parseInt(pathname);
  if (isNaN(poolId)) {
    throw new Error(
      `url need to end with poolId as pathname like for example so http://localhost:8787/<poolId>`
    );
  }
  return {
    async restart() {
      await fetch(`${urlWithPoolId}/restart`);
    },
    async start() {
      return await createServer({
        instance: wranglerDev(parameters || {}),
        port,
      }).start();
    },
  } as const;
}
