import debug from "debug";

import type {
  EnvironmentExtender,
  Network,
  ParamDefinitionAny,
  ResolvedConfig,
  RunSuperFunction,
  RunTaskFunction,
  RuntimeArgs,
  TaskArguments,
  TaskDefinition,
  TasksMap,
  TrestleRuntimeEnvironment
} from "../../types";
import { TrestleError } from "../core/errors";
import { ERRORS } from "../core/errors-list";
import { OverriddenTaskDefinition } from "./tasks/task-definitions";

const log = debug("trestle:core:pre");

export class Environment implements TrestleRuntimeEnvironment {
  private static readonly _BLACKLISTED_PROPERTIES: string[] = [
    "injectToGlobal",
    "_runTaskDefinition"
  ];

  public network: Network;

  private readonly _extenders: EnvironmentExtender[];

  /**
   * Initializes the trestle Runtime Environment and the given
   * extender functions.
   *
   * @remarks The extenders' execution order is given by the order
   * of the requires in the trestle's config file and its plugins.
   *
   * @param config The trestle's config object.
   * @param runtimeArgs The parsed trestle's arguments.
   * @param tasks A map of tasks.
   * @param extenders A list of extenders.
   * @param networkRequired if true it will assert that a requested network is defined.
   */
  constructor (
    public readonly config: ResolvedConfig,
    public readonly runtimeArgs: RuntimeArgs,
    public readonly tasks: TasksMap,
    extenders: EnvironmentExtender[] = [],
    networkRequired = true
  ) {
    log("Creating RuntimeEnv");

    const ncfg = config.networks[runtimeArgs.network];
    // network configuration is required for all tasks except few setup tasks
    if (!ncfg && networkRequired) {
      throw new TrestleError(ERRORS.NETWORK.CONFIG_NOT_FOUND, {
        network: runtimeArgs.network
      });
    }

    log("Runtime environment NOOP (MM)");
    // this.provider .... -- creation goes here

    this._extenders = extenders;
    this.network = {
      name: runtimeArgs.network,
      config: ncfg
    };

    extenders.forEach((extender) => extender(this));
  }

  /**
   * Executes the task with the given name.
   *
   * @param name The task's name.
   * @param taskArguments A map of task's arguments.
   *
   * @throws a TRESTLE303 if there aren't any defined tasks with the given name.
   * @returns a promise with the task's execution result.
   */
  public readonly run: RunTaskFunction = async (name, taskArguments = {}) => {
    const taskDefinition = this.tasks[name];

    log("Running task %s", name);

    if (taskDefinition === undefined) {
      throw new TrestleError(ERRORS.ARGUMENTS.UNRECOGNIZED_TASK, {
        task: name
      });
    }

    const resolvedTaskArguments = this._resolveValidTaskArguments(
      taskDefinition,
      taskArguments
    );

    return await this._runTaskDefinition(taskDefinition, resolvedTaskArguments);
  };

  /**
   * Injects the properties of `this` (the trestle Runtime Environment) into the global scope.
   *
   * @param blacklist a list of property names that won't be injected.
   *
   * @returns a function that restores the previous environment.
   */
  public injectToGlobal (
    blacklist: string[] = Environment._BLACKLISTED_PROPERTIES
  ): () => void {
    const globalAsAny = global as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const previousValues: { [name: string]: any } = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

    for (const [key, value] of Object.entries(this)) {
      if (blacklist.includes(key)) {
        continue;
      }

      previousValues[key] = globalAsAny[key];
      globalAsAny[key] = value;
    }

    return () => {
      for (const [key] of Object.entries(this)) {
        if (blacklist.includes(key)) {
          continue;
        }

        globalAsAny[key] = previousValues[key];
      }
    };
  }

  private async _runTaskDefinition (
    taskDefinition: TaskDefinition,
    taskArguments: TaskArguments
  ): Promise<void> {
    let runSuperFunction: any;  // eslint-disable-line

    if (taskDefinition instanceof OverriddenTaskDefinition) {
      runSuperFunction = async (
        _taskArguments: TaskArguments = taskArguments
      ) => {
        log("Running %s's super", taskDefinition.name);

        return await this._runTaskDefinition(
          taskDefinition.parentTaskDefinition,
          _taskArguments
        );
      };

      runSuperFunction.isDefined = true;
    } else {
      runSuperFunction = async () => {
        throw new TrestleError(ERRORS.TASK_DEFINITIONS.RUNSUPER_NOT_AVAILABLE, {
          taskName: taskDefinition.name
        });
      };

      runSuperFunction.isDefined = false;
    }

    const runSuper: RunSuperFunction<TaskArguments> = runSuperFunction;

    const globalAsAny = global as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const previousRunSuper = globalAsAny.runSuper;
    globalAsAny.runSuper = runSuper;

    const uninjectFromGlobal = this.injectToGlobal();

    try {
      return await taskDefinition.action(taskArguments, this, runSuper);
    } finally {
      uninjectFromGlobal();
      globalAsAny.runSuper = previousRunSuper;
    }
  }

  /**
   * Check that task arguments are within TaskDefinition defined params constraints.
   * Also, populate missing, non-mandatory arguments with default param values (if any).
   *
   * @private
   * @throws TrestleError if any of the following are true:
   *  > a required argument is missing
   *  > an argument's value's type doesn't match the defined param type
   *
   * @param taskDefinition
   * @param taskArguments
   * @returns resolvedTaskArguments
   */
  private _resolveValidTaskArguments (
    taskDefinition: TaskDefinition,
    taskArguments: TaskArguments
  ): TaskArguments {
    const { paramDefinitions, positionalParamDefinitions } = taskDefinition;

    const nonPositionalParamDefinitions = Object.values(paramDefinitions);

    // gather all task param definitions
    const allTaskParamDefinitions = [
      ...nonPositionalParamDefinitions,
      ...positionalParamDefinitions
    ];

    const initResolvedArguments: {
      errors: TrestleError[]
      values: TaskArguments
    } = { errors: [], values: {} };

    const resolvedArguments = allTaskParamDefinitions.reduce(
      ({ errors, values }, paramDefinition) => {
        try {
          const paramName = paramDefinition.name;
          const argumentValue = taskArguments[paramName];
          const resolvedArgumentValue = this._resolveArgument(
            paramDefinition,
            argumentValue
          );
          if (resolvedArgumentValue !== undefined) {
            values[paramName] = resolvedArgumentValue;
          }
        } catch (error) {
          errors.push(error);
        }
        return { errors, values };
      },
      initResolvedArguments
    );

    const { errors: resolveErrors, values: resolvedValues } = resolvedArguments;

    // if has argument errors, throw the first one
    if (resolveErrors.length > 0) {
      throw resolveErrors[0];
    }

    // append the rest of arguments that where not in the task param definitions
    return { ...taskArguments, ...resolvedValues };
  }

  /**
   * Resolves an argument according to a ParamDefinition rules.
   *
   * @param paramDefinition
   * @param argumentValue
   * @private
   */
  private _resolveArgument (
    paramDefinition: ParamDefinitionAny,
    argumentValue: any // eslint-disable-line @typescript-eslint/no-explicit-any
  ): any { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { name, isOptional, defaultValue } = paramDefinition;

    if (argumentValue === undefined) {
      if (isOptional) {
        // undefined & optional argument -> return defaultValue
        return defaultValue;
      }

      // undefined & mandatory argument -> error
      throw new TrestleError(ERRORS.ARGUMENTS.MISSING_TASK_ARGUMENT, {
        param: name
      });
    }

    // arg was present -> validate type, if applicable
    this._checkTypeValidation(paramDefinition, argumentValue);

    return argumentValue;
  }

  /**
   * Checks if value is valid for the specified param definition.
   *
   * @param paramDefinition {ParamDefinition} - the param definition for validation
   * @param argumentValue - the value to be validated
   * @private
   * @throws TRESTLE301 if value is not valid for the param type
   */
  private _checkTypeValidation (
    paramDefinition: ParamDefinitionAny,
    argumentValue: any // eslint-disable-line @typescript-eslint/no-explicit-any
  ): void {
    const { name: paramName, type, isVariadic } = paramDefinition;
    if (type === undefined || type.validate === undefined) {
      // no type or no validate() method defined, just skip validation.
      return;
    }

    // in case of variadic param, argValue is an array and the
    // type validation must pass for all values.
    // otherwise, it's a single value that is to be validated
    const argumentValueContainer = isVariadic ? argumentValue : [argumentValue];

    for (const value of argumentValueContainer) {
      type.validate(paramName, value);
    }
  }
}
