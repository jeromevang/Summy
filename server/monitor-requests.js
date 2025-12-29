import axios from 'axios';

async function monitorRequests() {
  console.log('🔍 MONITORING SERVER FOR CONTINUE REQUESTS');
  console.log('Waiting for requests from Continue...');
  console.log('Press Ctrl+C to stop monitoring');
  console.log('='.repeat(60));

  let lastLogCount = 0;

  const checkLogs = async () => {
    try {
      const logs = await axios.get('http://localhost:3001/api/tooly/logs?limit=10');
      const entries = logs.data.logs || [];

      if (entries.length > lastLogCount) {
        const newEntries = entries.slice(0, entries.length - lastLogCount);

        console.log(`\n📨 NEW REQUESTS DETECTED (${newEntries.length}):`);

        newEntries.forEach((entry, i) => {
          const timestamp = new Date(entry.timestamp).toLocaleTimeString();
          console.log(`[${timestamp}] ${entry.level?.toUpperCase()}: ${entry.message}`);

          // Highlight Continue-related requests
          if (entry.message && (
            entry.message.includes('Continue') ||
            entry.message.includes('continue') ||
            entry.message.includes('chat/completions') ||
            entry.message.includes('POST /v1/chat') ||
            entry.message.includes('tool')
          )) {
            console.log('🎯 CONTINUE REQUEST DETECTED!');
          }
        });

        lastLogCount = entries.length;
      }
    } catch (error) {
      console.log('❌ Error checking logs:', error.message);
    }
  };

  // Check immediately
  await checkLogs();

  // Then check every 2 seconds
  setInterval(checkLogs, 2000);
}

monitorRequests();
