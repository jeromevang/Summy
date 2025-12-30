import axios from 'axios';

async function checkLogsNow() {
  try {
    const logs = await axios.get('http://localhost:3001/api/tooly/logs?limit=10');
    const entries = logs.data.logs || [];

    console.log('📋 RECENT SERVER LOGS:');
    console.log('='.repeat(40));

    if (entries.length === 0) {
      console.log('❌ NO LOGS FOUND');
      console.log('Continue is NOT sending requests to port 3001');
    } else {
      entries.forEach((entry, i) => {
        const timestamp = new Date(entry.timestamp).toLocaleTimeString();
        console.log(`${i + 1}. [${timestamp}] ${entry.level}: ${entry.message}`);

        if (entry.message && (
          entry.message.includes('Continue') ||
          entry.message.includes('POST /v1/chat') ||
          entry.message.includes('chat/completions')
        )) {
          console.log('🎯 CONTINUE REQUEST DETECTED!');
        }
      });
    }

    console.log('='.repeat(40));

  } catch (error) {
    console.log('❌ Error accessing logs:', error.message);
  }
}

checkLogsNow();

