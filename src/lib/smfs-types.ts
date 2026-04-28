export type SmfsFile = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
};

export type AgentEvent = 
  | { type: 'text'; content: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; name: string; result: string }
  /**
   * Emitted by the server after all tool_results for one while-loop iteration
   * have been sent, signalling that the client should flush the current
   * assistant+tool_result pair into its raw history before starting a new
   * accumulation for the next loop iteration.
   */
  | { type: 'loop_turn' }
  | { type: 'error'; message: string }
  | { type: 'done' };
