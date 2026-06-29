# Veyr SDK

Plug-in LLM cost tracking for production apps. One env var, two lines of code.

## Install

```bash
npm install canopy-sdk openai
```

## Usage

```ts
import OpenAI from "openai";
import { veyrOpenAI } from "canopy-sdk";

const openai = new OpenAI(
  veyrOpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    feature: "my-feature", // optional — appears in dashboard
  })
);

// All completions are logged automatically
await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello" }],
});
```

```bash
# Only new secret — from Veyr dashboard → API Keys
export VEYR_KEY=pl_live_...
```

### Anthropic

```ts
import Anthropic from "@anthropic-ai/sdk";
import { veyrAnthropic } from "canopy-sdk";

const anthropic = new Anthropic(
  veyrAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
);
```

### Self-hosted proxy

```ts
veyrOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseUrl: "https://veyr.mycompany.com",
});
```

Or set `VEYR_BASE_URL` in the environment.

## Lower-level API

If you prefer spreading config yourself:

```ts
import { createOpenAIConfig, resolveVeyrConfig } from "canopy-sdk";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  ...createOpenAIConfig(resolveVeyrConfig()),
});
```

## vs TokenGuard

[TokenGuard](https://github.com/hethb/TokenGuard) is a browser extension that optimizes chat usage. Veyr is for **teams** that call OpenAI/Anthropic from code and need spend broken down by feature and prompt template.
