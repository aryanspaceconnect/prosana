import { zodToJsonSchema } from 'zod-to-json-schema';
import { SANA_TOOL_REGISTRY } from './tools.js';
import { ToolDefinition } from './types.js';
import { mcpManager } from './mcp/McpManager.js';

let cachedMcpToolDefs: ToolDefinition[] = [];

export async function refreshMcpToolsCache(): Promise<ToolDefinition[]> {
  try {
    cachedMcpToolDefs = await mcpManager.getMcpToolDefinitions();
  } catch (err) {
    console.warn('[GeminiTools] Error refreshing MCP tools cache:', err);
  }
  return cachedMcpToolDefs;
}

export function getAllToolDefinitions(): ToolDefinition[] {
  return [...SANA_TOOL_REGISTRY, ...cachedMcpToolDefs];
}

export function getGeminiToolDeclarations() {
  const allTools = getAllToolDefinitions();

  const functionDeclarations = allTools.map((tool: ToolDefinition) => {
    const rawSchema = zodToJsonSchema(tool.parameters as any, tool.name);
    // Extract property schema removing $schema meta header
    let parameters: any = { type: 'object', properties: {} };
    if ('definitions' in rawSchema && rawSchema.definitions && rawSchema.definitions[tool.name]) {
      parameters = rawSchema.definitions[tool.name];
    } else if (rawSchema) {
      parameters = { ...rawSchema };
      delete parameters.$schema;
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters
    };
  });

  return [
    {
      functionDeclarations
    }
  ];
}

export function findToolByName(name: string): ToolDefinition | undefined {
  return getAllToolDefinitions().find(t => t.name === name);
}

