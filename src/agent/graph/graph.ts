import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import { AgentStateAnnotation, AgentState } from './state.js';
import {
  initializeNode,
  reasoningNode,
  toolsNode,
  approvalNode,
  scanMeasureNode,
  scanInterpretNode,
  scanRespondNode,
  finalizeNode
} from './nodes.js';

const MAX_ITERATIONS = 7;

// Persistent memory checkpointer for state checkpointing across thread sessions
export const checkpointer = new MemorySaver();

// Dedicated Scan Subgraph (Measure -> Interpret -> Respond)
export function createScanSubgraph() {
  return new StateGraph(AgentStateAnnotation)
    .addNode('scan_measure', scanMeasureNode)
    .addNode('scan_interpret', scanInterpretNode)
    .addNode('scan_respond', scanRespondNode)
    .addEdge(START, 'scan_measure')
    .addEdge('scan_measure', 'scan_interpret')
    .addEdge('scan_interpret', 'scan_respond')
    .addEdge('scan_respond', END)
    .compile();
}

export const scanSubgraph = createScanSubgraph();

function routeAfterReasoning(state: AgentState): 'tools' | 'scan_pipeline' | 'approval' | 'finalize' {
  // Prevent infinite loops
  if (state.iterations >= MAX_ITERATIONS) {
    console.log(`[LangGraph Loop] Reached max iterations (${MAX_ITERATIONS}). Directing to finalize.`);
    return 'finalize';
  }

  // If LLM selected tools via function calling, execute tools
  if (state.pendingFunctionCalls && state.pendingFunctionCalls.length > 0) {
    return 'tools';
  }

  // If user approval card is required
  if (state.actionProposal || state.status === 'need_approval') {
    return 'approval';
  }

  // Check if scan request
  const isScanRequest = /(scan|analyze skin|skin barrier|photo assessment|redness assessment)/i.test(state.message);
  if (isScanRequest && state.iterations === 1 && !state.finalText) {
    return 'scan_pipeline';
  }

  return 'finalize';
}

export function createSanaGraph() {
  const workflow = new StateGraph(AgentStateAnnotation)
    .addNode('initialize', initializeNode)
    .addNode('reasoning', reasoningNode)
    .addNode('tools', toolsNode)
    .addNode('scan_pipeline', scanSubgraph)
    .addNode('approval', approvalNode)
    .addNode('finalize', finalizeNode)

    // Workflow entry: initialize context -> enter autonomous reasoning node
    .addEdge(START, 'initialize')
    .addEdge('initialize', 'reasoning')

    // Autonomous Router Edge:
    // reasoning -> tools -> reasoning (Dynamic LLM Loop!)
    .addConditionalEdges('reasoning', routeAfterReasoning, {
      tools: 'tools',
      scan_pipeline: 'scan_pipeline',
      approval: 'approval',
      finalize: 'finalize'
    })

    // Loop back from tools execution directly into reasoning node for multi-turn tool synthesis
    .addEdge('tools', 'reasoning')

    // Finalization routes
    .addEdge('scan_pipeline', 'finalize')
    .addEdge('approval', END)
    .addEdge('finalize', END);

  return workflow.compile({ checkpointer });
}

export const sanaGraph = createSanaGraph();
