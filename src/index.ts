#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { tools } from './tools.js';

const server = new Server(
  { name: 'sonsuchup-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.inputSchema, { target: 'jsonSchema7' }) as Record<
      string,
      unknown
    >,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools.find((t) => t.name === req.params.name);
  if (!tool) {
    return {
      content: [{ type: 'text', text: `알 수 없는 도구: ${req.params.name}` }],
      isError: true,
    };
  }
  try {
    const args = tool.inputSchema.parse(req.params.arguments ?? {});
    const result = await tool.handler(args);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `에러: ${msg}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
