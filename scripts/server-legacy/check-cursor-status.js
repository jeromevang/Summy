import axios from 'axios';

async function checkCursorStatus() {
  console.log('🔍 CHECKING CURSOR INTEGRATION STATUS');

  // Check recent logs for Cursor requests
  try {
    const logs = await axios.get('http://localhost:3001/api/debug/logs?limit=10');
    const logEntries = logs.data.logs || [];

    console.log(`Found ${logEntries.length} recent log entries`);

    const cursorRequests = logEntries.filter(function(log) {
      return log.message && (
        log.message.includes('Cursor') ||
        log.message.includes('cursor') ||
        log.message.includes('tool') ||
        log.message.includes('mcp')
      );
    });

    console.log(`Cursor/tool related entries: ${cursorRequests.length}`);

    if (cursorRequests.length > 0) {
      console.log('✅ Cursor requests detected!');
    } else {
      console.log('❌ No Cursor/tool requests detected');
    }

  } catch (error) {
    console.log('❌ Cannot access debug logs');
  }

  // Check IDE mapping
  try {
    const mapping = await axios.get('http://localhost:3001/api/tooly/ide-mapping/cursor');
    console.log('✅ Cursor IDE mapping loaded');

    if (mapping.data && mapping.data.mappings) {
      const toolCount = Object.keys(mapping.data.mappings).length;
      console.log(`   Mapped ${toolCount} Cursor tools to MCP`);
    }

  } catch (error) {
    console.log('❌ Cursor IDE mapping not accessible');
  }

  console.log('\n🎯 WHAT THIS MIDDLEWARE DOES:');
  console.log('1. Intercepts Cursor tool calls (Read, Write, Shell, etc.)');
  console.log('2. Routes them through MCP tool system with 73+ tools');
  console.log('3. Adds learning, context management, and optimization');
  console.log('4. Returns results back to Cursor');
  console.log('');
  console.log('❌ ISSUE: Cursor is not sending requests to this middleware');
  console.log('💡 SOLUTION: Configure Cursor to use http://localhost:3001/v1/chat/completions');
}

checkCursorStatus();
