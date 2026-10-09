import vm from 'vm';
import { getCurLoop } from './reportUtils';
import { ReportData, Context, SandBox } from './types';
import {
  isError,
  CommandExecutionError,
  NullishCommandResultError,
} from './errors';
import { logger } from './debug';

// Runs a user snippet in a sandbox, and returns the result.
// The snippet can return a Promise, which is then awaited.
// The sandbox is kept for the execution of snippets later on
// in the template. Sandboxing can also be disabled via
// ctx.options.noSandbox.
export async function runUserJsAndGetRaw(
  data: ReportData | undefined,
  code: string,
  ctx: Context,
  sandboxOverride?: SandBox,
  frozenCtx?: Context
): Promise<any> {
  // Retrieve the current JS sandbox contents (if any) and add
  // the code to be run, and a placeholder for the result,
  // as well as all data defined by the user.
  // When sandboxOverride is provided (deferred image evaluation),
  // use it as-is — data, additionalJsContext, vars, and $idx are
  // already baked in with the correct priority from walk time.
  const sandbox: SandBox = sandboxOverride
    ? { ...sandboxOverride, __code__: code, __result__: undefined }
    : {
        ...(ctx.jsSandbox || {}),
        __code__: code,
        __result__: undefined,
        ...data,
        ...ctx.options.additionalJsContext,
      };

  // Add currently defined vars, including loop vars and the index
  // of the innermost loop.
  // Skip when sandboxOverride is provided — the frozen sandbox already
  // contains the correct $idx and $varName values from walk time.
  if (!sandboxOverride) {
    const curLoop = getCurLoop(ctx);
    if (curLoop) sandbox.$idx = curLoop.idx;
    Object.keys(ctx.vars).forEach(varName => {
      sandbox[`$${varName}`] = ctx.vars[varName];
    });
  }

  // Run the JS snippet and extract the result
  let context;
  let result;
  try {
    if (ctx.options.runJs) {
      // When a frozenCtx is provided (parallel image mode), pass it to runJs
      // so the user's custom runner sees correct walk-time vars/loops state
      const temp = ctx.options.runJs({ sandbox, ctx: frozenCtx ?? ctx });
      context = temp.modifiedSandbox;
      result = await temp.result;
    } else if (ctx.options.noSandbox) {
      context = sandbox;
      const wrapper = new Function('with(this) { return eval(__code__); }');
      // `with` only intercepts identifiers that are already properties of its
      // target, so EXEC's bare assignment to a NEW name (`{{! total = 0 }}`)
      // would fall through to the host global object instead of landing on the
      // sandbox. The sandbox snapshot would then be missing exactly the vars
      // parallel IMAGE evaluation needs, and every deferred expression would
      // read the final iteration's value from the global.
      //
      // The `has` trap claims every name the host global does not already
      // define, so those assignments land on the sandbox and nothing is ever
      // written to globalThis -- no cleanup pass, and no chance of clobbering a
      // cache or singleton that helper code keeps there on purpose. Names the
      // host global does define are left unclaimed, so they keep resolving
      // through the real global scope with their usual receiver (`fetch`,
      // `console`, `Math` and direct `eval` are unaffected). Reading a name
      // neither side defines still throws ReferenceError.
      //
      // One deviation from plain `with`: `typeof someUndeclaredName` throws
      // rather than yielding 'undefined', because the name now resolves here.
      const globalObj = globalThis as unknown as Record<string, unknown>;
      const scope = new Proxy(sandbox, {
        has: (target, key) => key in target || !(key in globalObj),
        get: (target, key) => {
          if (key === Symbol.unscopables) return undefined;
          if (key in target) return (target as SandBox)[key as string];
          if (key in globalObj) return globalObj[key as string];
          throw new ReferenceError(`${String(key)} is not defined`);
        },
      });
      result = await wrapper.call(scope);
    } else {
      const script = new vm.Script(sandbox.__code__ ?? '');
      context = vm.createContext(sandbox);
      result = await script.runInContext(context);
    }
  } catch (err) {
    const e = isError(err) ? err : new Error(`${err}`);
    if (ctx.options.errorHandler != null) {
      context = sandbox;
      result = await ctx.options.errorHandler(e, code);
    } else {
      throw new CommandExecutionError(e, code);
    }
  }

  if (ctx.options.rejectNullish && result == null) {
    const nerr = new NullishCommandResultError(code);
    if (ctx.options.errorHandler != null) {
      result = await ctx.options.errorHandler(nerr, code);
    } else {
      throw nerr;
    }
  }

  // Save the sandbox for later use, omitting the __code__ and __result__ properties.
  // Skip writeback when a sandboxOverride was provided — deferred image evaluations
  // run after template walking is complete and should not pollute the shared sandbox.
  if (!sandboxOverride) {
    ctx.jsSandbox = {
      ...context,
      __code__: undefined,
      __result__: undefined,
    };
  }
  logger.debug('Command returned: ', result);
  return result;
}
