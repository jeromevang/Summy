import axios from 'axios';

async function checkLatestLogs() {
  try {
    const logs = await axios.get('http://localhost:3001/api/tooly/logs?limit=5');
    const entries = logs.data.logs || [];

    console.log('📋 LATEST SERVER LOGS (AFTER YOUR MESSAGE):');
    console.log('='.repeat(50));

    if (entries.length === 0) {
      console.log('❌ No logs - this is the issue!');
    } else {
      entries.forEach((entry, i) => {
        const timestamp = new Date(entry.timestamp).toLocaleTimeString();
        console.log(`${i + 1}. [${timestamp}] ${entry.level?.toUpperCase()}: ${entry.message?.substring(0, 120)}`);
      });
    }

    console.log('='.repeat(50));
    console.log('Continue HIT the server (200 OK), but something failed in processing');

  } catch (error) {
    console.log('Error:', error.message);
  }
}

checkLatestLogs();

