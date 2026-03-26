/**
 * Check computation engine status
 */

const COMPUTE_URL = process.env.COMPUTE_API_URL || 'http://localhost:8000';

async function checkCompute() {
  console.log('Checking Computation Engine...');
  console.log('URL:', COMPUTE_URL);
  
  try {
    const res = await fetch(`${COMPUTE_URL}/health`, { timeout: 5000 });
    if (res.ok) {
      console.log('✅ Computation Engine is running');
      const data = await res.json();
      console.log('Status:', data);
    } else {
      console.log('❌ Computation Engine returned error:', res.status);
    }
  } catch (error) {
    console.log('❌ Computation Engine not accessible:', error.message);
    console.log('\nTo start the computation engine:');
    console.log('  cd computation-engine');
    console.log('  python -m uvicorn main:app --reload --port 8000');
  }
}

checkCompute();
