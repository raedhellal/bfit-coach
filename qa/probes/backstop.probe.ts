import { test } from "../fixture-test";
import { markRan } from "./marker";

// The resetting `test`: this probe exercises the worker-scoped refusal in qa/fixture-test.ts.
test("backstop probe one", async ({}, testInfo) => markRan(testInfo));
test("backstop probe two", async ({}, testInfo) => markRan(testInfo));
