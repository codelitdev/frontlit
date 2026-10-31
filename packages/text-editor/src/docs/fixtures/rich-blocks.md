---
title: Rich blocks
---

# Rich blocks

<Callout>

A plain callout uses the default type.

</Callout>

<Callout type="warning" title="Heads up">

Callouts hold **any** blocks, including [`linked code`](/docs/setup).

- One

- Two

</Callout>

```ts title="app/api/route.ts"
export const POST = handler;
```

<Tabs items={["npm", 'Plain "quoted" tab']}>

<Tab value="npm">

```bash
npm install medialit
```

</Tab>

<Tab value="Plain &quot;quoted&quot; tab">

Text in a tab.

</Tab>

</Tabs>

<Steps>

<Step>

### Install

Run the installer.

</Step>

<Step>

### Configure

Set the key.

</Step>

</Steps>

<Cards>

<Card title="Quick start" href="/docs/quick-start" icon={<Rocket />}>

Upload your first file.

</Card>

<Card title="No description" />

</Cards>

<Accordions type="single">

<Accordion title="Is it free?">

Yes.

</Accordion>

</Accordions>

<CodeGroup>

```ts title="client.ts"
upload();
```

```bash
curl https://api.example.com
```

</CodeGroup>

<TypeTable
  type={{
    apiKey: { type: "string", default: "MEDIALIT_API_KEY", description: "Your app's key." },
    access: { type: '"public" | "private"', required: true },
    "data-id": { type: "number" },
  }}
/>
