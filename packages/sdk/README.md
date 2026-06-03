# promptlens

Drop-in SDK for the [PromptLens](https://promptlens.dev) proxy. Routes your
OpenAI and Anthropic calls through PromptLens for full cost observability —
broken down by feature, model, and prompt template.

## Install

```bash
npm install promptlens
```

## Usage

### OpenAI

```ts
import OpenAI from "openai";
import { createOpenAIConfig } from "promptlens";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  ...createOpenAIConfig({ apiKey: process.env.PROMPTLENS_KEY! }),
});

// That's it. All calls are now logged and attributed.
```

### Anthropic

```ts
import Anthropic from "@anthropic-ai/sdk";
import { createAnthropicConfig } from "promptlens";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  ...createAnthropicConfig({ apiKey: process.env.PROMPTLENS_KEY! }),
});
```

## Tagging requests by feature

PromptLens automatically infers a `feature_tag` from the request path
(via the `Referer` header or an explicit `x-request-path` header). To set
it explicitly, send the `x-feature-tag` header on the underlying call:

```ts
await openai.chat.completions.create(
  {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Summarize this." }],
  },
  {
    headers: { "x-feature-tag": "summarize" },
  },
);
```

## Self-hosting

Set `baseUrl` to your own proxy:

```ts
createOpenAIConfig({
  apiKey: process.env.PROMPTLENS_KEY!,
  baseUrl: "https://promptlens.mycompany.com",
});
```
