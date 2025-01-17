import deepmerge from "deepmerge";
import * as path from "path";

import type {
  Config,
  ConfigExtender,
  ProjectPathsConfig,
  ResolvedConfig,
  StrMap,
  UserPaths
} from "../../../types";
import { fromEntries } from "../../util/lang";

function mergeUserAndDefaultConfigs (
  defaultConfig: Config,
  userConfig: Config
): Partial<ResolvedConfig> {
  return deepmerge(defaultConfig, userConfig, {
    arrayMerge: (destination: any[], source: any[]) => source // eslint-disable-line @typescript-eslint/no-explicit-any
  }) as Partial<ResolvedConfig>;
}

/**
 * This functions resolves the trestle config by merging the user provided config
 * and the trestle default config.
 *
 * @param userConfigPath the user config filepath
 * @param defaultConfig  the trestle's default config object
 * @param userConfig     the user config object
 * @param configExtenders An array of ConfigExtenders
 *
 * @returns the resolved config
 */
export function resolveConfig (
  userConfigPath: string | undefined,
  defaultConfig: Config,
  userConfig: Config,
  configExtenders: ConfigExtender[]
): ResolvedConfig {
  const config: Partial<ResolvedConfig> = mergeUserAndDefaultConfigs(defaultConfig, userConfig);

  const paths = userConfigPath !== undefined
    ? resolveProjectPaths(userConfigPath, userConfig.paths)
    : undefined;
  const resolved: ResolvedConfig = {
    ...config,
    paths,
    networks: config.networks ?? {}
  };

  for (const extender of configExtenders) {
    extender(resolved, userConfig);
  }

  return resolved;
}

function resolvePathFrom (
  from: string,
  defaultPath: string,
  relativeOrAbsolutePath: string = defaultPath
): string {
  if (path.isAbsolute(relativeOrAbsolutePath)) {
    return relativeOrAbsolutePath;
  }

  return path.join(from, relativeOrAbsolutePath);
}

/**
 * This function resolves the ProjectPaths object from the user-provided config
 * and its path. The logic of this is not obvious and should well be document.
 * The good thing is that most users will never use this.
 *
 * Explanation:
 *    - paths.configFile is not overridable
 *    - If a path is absolute it is used "as is".
 *    - If the root path is relative, it's resolved from paths.configFile's dir.
 *    - If any other path is relative, it's resolved from paths.root.
 */
export function resolveProjectPaths (
  userConfigPath: string,
  userPaths: UserPaths = {}
): ProjectPathsConfig {
  const configDir = path.dirname(userConfigPath);
  const root = resolvePathFrom(configDir, "", userPaths.root);

  const otherPathsEntries = Object.entries<string>(userPaths as StrMap).map<
  [string, string]
  >(([name, value]) => [name, resolvePathFrom(root, value)]);

  const otherPaths = fromEntries(otherPathsEntries);

  return {
    ...otherPaths,
    root,
    configFile: userConfigPath,
    sources: resolvePathFrom(root, "contracts", userPaths.sources),
    cache: resolvePathFrom(root, "cache", userPaths.cache),
    artifacts: resolvePathFrom(root, "artifacts", userPaths.artifacts),
    tests: resolvePathFrom(root, "test", userPaths.tests)
  };
}
