import { task } from "../internal/core/config/config-env";
import { getClient } from "../lib/client";
import { TaskArguments, TrestleRuntimeEnvironment } from "../types";
import { TASK_NODE_INFO } from "./task-names";

export default function (): void {
  task(TASK_NODE_INFO, "Prints node info and status")
    .setAction(nodeInfo);
}

async function nodeInfo (_taskArgs: TaskArguments, env: TrestleRuntimeEnvironment): Promise<void> {
  const client = await getClient(env.network);
  console.log("Network:", env.network.name);
  console.log("ChainId:", await client.getChainId());
  console.log("Block height:", await client.getHeight());
  /* const nodeInfo = await client.nodeInfo()
  // eslint-disable-next-line
    .catch((err) => { throw new Error(`Could not fetch node info: ${err}`); });
  console.log('Node Info: ', nodeInfo); */
}
