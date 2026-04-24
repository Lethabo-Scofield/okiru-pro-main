/**
 * Test connection to Computation Engine
 */

const COMPUTE_URL = 'http://127.0.0.1:8000';

async function testConnection() {
  console.log('Testing Computation Engine connection...');
  console.log('URL:', COMPUTE_URL);
  
  try {
    // Test 1: Basic connectivity
    console.log('\n1. Testing basic connectivity...');
    const res = await fetch(`${COMPUTE_URL}/admin/models/list`, {
      method: 'GET',
      headers: {
        'X-Admin': 'true',
      },
    });
    console.log('   Status:', res.status);
    
    if (res.ok) {
      const data = await res.json();
      console.log('   ✅ Connected! Found', data.length, 'models');
    } else {
      console.log('   ❌ Failed:', await res.text());
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
  
  // Test 2: Different localhost variant
  try {
    console.log('\n2. Testing localhost variant...');
    const res = await fetch(`http://localhost:8000/admin/models/list`, {
      method: 'GET',
      headers: {
        'X-Admin': 'true',
      },
    });
    console.log('   Status:', res.status);
    
    if (res.ok) {
      const data = await res.json();
      console.log('   ✅ Connected! Found', data.length, 'models');
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
  
  // Test 3: Direct IP
  try {
    console.log('\n3. Testing with 0.0.0.0...');
    const res = await fetch(`http://0.0.0.0:8000/admin/models/list`, {
      method: 'GET',
      headers: {
        'X-Admin': 'true',
      },
    });
    console.log('   Status:', res.status);
    
    if (res.ok) {
      const data = await res.json();
      console.log('   ✅ Connected! Found', data.length, 'models');
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
}

testConnection();
