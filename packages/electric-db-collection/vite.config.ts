import { defineConfig, mergeConfig } from "vitest/config"
import { tanstackViteConfig } from "@tanstack/config/vite"
import packageJson from "./package.json"

const config = defineConfig({
  test: {
    name: packageJson.name,
    include: [`tests/**/*.test.ts`, `e2e/**/*.e2e.test.ts`],
    environment: `jsdom`,
    coverage: { enabled: true, provider: `istanbul`, include: [`src/**/*`] },
    typecheck: { enabled: true },
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: `./src/index.ts`,
    srcDir: `./src`,
  })
)
