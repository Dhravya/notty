export type SmfsFile = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
};

export type AgentEvent = 
  | { type: 'text'; content: string }
  | { type: 'tool_use'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'error'; message: string }
  | { type: 'done' };
