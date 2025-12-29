import axios from 'axios';

async function checkContinueLogs() {
  console.log('📋 CHECKING SERVER LOGS FOR CONTINUE REQUESTS');

  try {
    const logs = await axios.get('http://localhost:3001/api/debug/logs?limit=20');
    const entries = logs.data.logs || [];

    console.log(`Found ${entries.length} recent log entries`);

    const continueRequests = entries.filter(entry =>
      entry.message && (
        entry.message.includes('Continue') ||
        entry.message.includes('continue') ||
        entry.message.includes('chat/completions') ||
        entry.message.includes('POST') ||
        entry.message.includes('v1/chat')
      )
    );

    console.log(`Continue-related entries: ${continueRequests.length}`);

    if (continueRequests.length > 0) {
      console.log('\n📨 RECENT REQUESTS FROM CONTINUE:');
      continueRequests.slice(0, 5).forEach((entry, i) => {
        console.log(`${i + 1}. [${entry.timestamp}] ${entry.message?.substring(0, 100)}...`);
      });
    } else {
      console.log('\n❌ NO REQUESTS FROM CONTINUE DETECTED');
      console.log('This means Continue is NOT configured to use this middleware');
      console.log('Check Continue settings - API Base URL should be: http://localhost:3001/v1');
    }

  } catch (error) {
    console.log('❌ Cannot access server logs');
  }
}

checkContinueLogs();

