const { getAgenticReadinessSuite } = require('./server/src/modules/tooly/testing/agentic-readiness-suite.ts');
const suite = getAgenticReadinessSuite();
console.log('✅ Configurable suite loaded successfully');
console.log('📊 Tests loaded:', suite.length);
console.log('🧪 First test:', suite[0]?.name);
console.log('🎯 Last test:', suite[suite.length-1]?.name);




