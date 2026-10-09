import { ReportData, Context, SandBox } from './types';
export declare function runUserJsAndGetRaw(data: ReportData | undefined, code: string, ctx: Context, sandboxOverride?: SandBox, frozenCtx?: Context): Promise<any>;
