import { test } from "@playwright/test";
import { markRan } from "./marker";

// Plain `test` on purpose: this probe exercises the config's globalSetup refusal only.
test("probe one", async ({}, testInfo) => markRan(testInfo));
test("probe two", async ({}, testInfo) => markRan(testInfo));
