/**
 * ESLint 8 ships no type declarations and `@types/eslint` is not installed. `qa/invariant-n-
 * lint-bans.spec.ts` drives the repo's real `.eslintrc.json` through ESLint's Node API, so this
 * declares only what that file calls (as `next-path-to-regexp.d.ts` does for its module).
 */
declare module "eslint" {
  export interface LintMessage {
    ruleId: string | null;
    severity: 0 | 1 | 2;
    message: string;
    line: number;
    column: number;
    fatal?: boolean;
  }
  export interface LintResult {
    filePath: string;
    messages: LintMessage[];
    errorCount: number;
    fatalErrorCount?: number;
  }
  export class ESLint {
    constructor(options?: { cwd?: string; useEslintrc?: boolean });
    lintText(code: string, options?: { filePath?: string }): Promise<LintResult[]>;
    lintFiles(patterns: string | string[]): Promise<LintResult[]>;
    isPathIgnored(filePath: string): Promise<boolean>;
    calculateConfigForFile(filePath: string): Promise<{ rules?: Record<string, unknown> }>;
  }
}
