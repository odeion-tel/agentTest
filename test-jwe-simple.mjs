import { create_auth_token, verify_jwe_token, create_refresh_token, is_token_expired } from './src/utils/jwe.ts';

const mockUser = {
  id: 'user_123456789',
  email: 'test@example.com',
  is_admin: true
};

const testSecret = 'test-secret-key-for-jwt-operations-minimum-32-characters-long-enough';

async function runTests() {
  console.log('Starting JWE Token System Tests...\n');
  
  let passCount = 0;
  let failCount = 0;
  
  // Test 1: Auth token creation and verification
  try {
    console.log('Test 1: Auth token creation and verification');
    const authToken = await create_auth_token(mockUser, testSecret);
    const authPayload = await verify_jwe_token(authToken, testSecret);
    
    if (authPayload.type === 'auth' && authPayload.user_id === mockUser.id) {
      console.log('✅ PASS: Auth token created and verified');
      passCount++;
    } else {
      console.log('❌ FAIL: Auth token payload incorrect');
      failCount++;
    }
  } catch (error) {
    console.log(`❌ FAIL: Auth token test failed - ${error.message}`);
    failCount++;
  }
  
  // Test 2: Refresh token creation and verification
  try {
    console.log('\nTest 2: Refresh token creation and verification');
    const refreshToken = await create_refresh_token(mockUser, testSecret);
    const refreshPayload = await verify_jwe_token(refreshToken, testSecret);
    
    if (refreshPayload.type === 'refresh' && refreshPayload.user_id === mockUser.id) {
      console.log('✅ PASS: Refresh token created and verified');
      passCount++;
    } else {
      console.log('❌ FAIL: Refresh token payload incorrect');
      failCount++;
    }
  } catch (error) {
    console.log(`❌ FAIL: Refresh token test failed - ${error.message}`);
    failCount++;
  }
  
  // Test 3: Token expiration check
  try {
    console.log('\nTest 3: Token expiration check');
    const authToken = await create_auth_token(mockUser, testSecret);
    const authPayload = await verify_jwe_token(authToken, testSecret);
    
    if (!is_token_expired(authPayload)) {
      console.log('✅ PASS: Fresh token correctly identified as not expired');
      passCount++;
    } else {
      console.log('❌ FAIL: Fresh token incorrectly identified as expired');
      failCount++;
    }
  } catch (error) {
    console.log(`❌ FAIL: Token expiration test failed - ${error.message}`);
    failCount++;
  }
  
  // Test 4: Wrong secret rejection
  try {
    console.log('\nTest 4: Wrong secret rejection');
    const authToken = await create_auth_token(mockUser, testSecret);
    const wrongSecret = 'wrong-secret-key-for-testing-different-from-original-key';
    
    try {
      await verify_jwe_token(authToken, wrongSecret);
      console.log('❌ FAIL: Token with wrong secret was not rejected');
      failCount++;
    } catch (error) {
      console.log('✅ PASS: Token with wrong secret correctly rejected');
      passCount++;
    }
  } catch (error) {
    console.log(`❌ FAIL: Wrong secret test setup failed - ${error.message}`);
    failCount++;
  }
  
  console.log(`\nTest Results:`);
  console.log(`✅ Passing: ${passCount} tests`);
  console.log(`❌ Failing: ${failCount} tests`);
  
  if (failCount > 0) {
    console.log('\nReturning control for fixes.');
    process.exit(1);
  } else {
    console.log('\nAll tests passed successfully!');
  }
}

runTests().catch(console.error);
