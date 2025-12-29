# Agentic Readiness Test Suite Configuration

The test suite is now **fully configurable** - no more hardcoded tests! You can modify, add, or remove tests by editing `agentic-readiness-suite.json`.

## 📝 How to Modify Tests

### Adding a New Test

```json
{
  "id": "AR-21",
  "name": "My Custom Test",
  "category": "tool",
  "description": "Tests something specific",
  "prompt": "Your test prompt here",
  "expectedTool": "tool_name",
  "evaluationLogic": "return evaluateCustomTest(response, toolCalls);"
}
```

### Modifying Existing Tests

1. **Change the prompt**: Update the `"prompt"` field
2. **Adjust expectations**: Modify `expectedTool`, `expectedToolAny`, or `expectedNoTool`
3. **Update evaluation**: Change the `evaluationLogic` to reference different evaluation functions

### Available Evaluation Functions

- `evaluateBasicToolEmit` - Tests basic tool calling
- `evaluateMultiToolSelection` - Tests tool choice among options
- `evaluateToolSuppression` - Tests NOT calling tools when inappropriate
- `evaluateArgumentValidation` - Tests correct tool arguments
- `evaluateNearIdenticalToolChoice` - Tests choosing the right similar tool
- `evaluateRAGFirstBehavior` - Tests using RAG first
- `evaluateRAGBeforeFileRead` - Tests RAG before file access
- `evaluateRAGResultSynthesis` - Tests synthesizing RAG results
- `evaluateRAGChaining` - Tests chaining RAG with file reads
- `evaluateMultiStepPlanning` - Tests complex multi-step tasks
- `evaluateConditionalLogic` - Tests handling conditions
- `evaluateContextContinuity` - Tests using previous context
- `evaluateEdgeCaseAwareness` - Tests edge case consideration
- `evaluateQuestionVsAction` - Tests knowing when to answer vs act
- `evaluateImplicitFileRead` - Tests implicit file reading needs
- `evaluateSearchIntentDetection` - Tests recognizing search needs
- `evaluateWebSearch` - Tests web search usage
- `evaluatePageNavigation` - Tests URL navigation
- `evaluateContentExtraction` - Tests web content extraction
- `evaluateBrowserInteraction` - Tests browser element interaction

## ⚙️ Configuration Options

### Category Weights
Adjust how much each category contributes to the final score:

```json
"categoryWeights": {
  "tool": 0.30,      // 30%
  "rag": 0.25,       // 25%
  "reasoning": 0.20, // 20%
  "intent": 0.15,    // 15%
  "browser": 0.10    // 10%
}
```

### Passing Threshold
Set the minimum score required to pass:

```json
"threshold": 70  // 70% required to pass
```

## 🔄 How It Works

1. **Load**: Tests are loaded from `agentic-readiness-suite.json` at runtime
2. **Map**: Evaluation logic strings are mapped to actual TypeScript functions
3. **Execute**: Tests run using the mapped evaluation functions
4. **Score**: Results are calculated based on category weights and threshold

## 🚀 Benefits

- ✅ **No Code Changes**: Modify tests without touching TypeScript files
- ✅ **Version Control**: JSON file is properly tracked in git
- ✅ **Runtime Reload**: Changes take effect immediately (no restart needed)
- ✅ **Easy Customization**: Add, remove, or modify tests with simple JSON edits
- ✅ **Documentation**: Self-documenting test definitions

## 📋 Test Categories

- **🔧 Tool Calling** (AR-1 to AR-5): Basic tool invocation and selection
- **📚 RAG Usage** (AR-6 to AR-9): Retrieval-first behavior and synthesis
- **🧠 Reasoning** (AR-10 to AR-13): Multi-step planning and logic
- **🎯 Intent Recognition** (AR-14 to AR-16): Knowing when to tool vs answer
- **🌐 Browser/Web** (AR-17 to AR-20): Web search and browser control






