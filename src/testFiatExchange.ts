// Quick test for FreeCurrencyAPI integration
import 'dotenv/config';
import { getFiatRate, convertFiat, SUPPORTED_FIAT } from './fiatExchange.js';

async function testFiatExchange() {
  console.log('=== Testing FreeCurrencyAPI Integration ===');
  
  console.log(`Supported fiat currencies: ${SUPPORTED_FIAT.join(', ')}`);
  
  try {
    // Test 1: Get USD -> EUR rate
    console.log('\n[Test 1] Fetching USD -> EUR rate...');
    const usdToEur = await getFiatRate('USD', 'EUR');
    console.log(`✅ USD -> EUR: ${usdToEur}`);
    
    // Test 2: Get USD -> SGD rate
    console.log('\n[Test 2] Fetching USD -> SGD rate...');
    const usdToSgd = await getFiatRate('USD', 'SGD');
    console.log(`✅ USD -> SGD: ${usdToSgd}`);
    
    // Test 3: Convert 100 USD to IDR
    console.log('\n[Test 3] Converting 100 USD to IDR...');
    const amount = 100;
    const idrAmount = await convertFiat(amount, 'USD', 'IDR');
    console.log(`✅ ${amount} USD = ${idrAmount.toFixed(2)} IDR`);
    
    // Test 4: Get EUR -> JPY rate (via USD fallback)
    console.log('\n[Test 4] Fetching EUR -> JPY rate (via USD fallback)...');
    const eurToJpy = await getFiatRate('EUR', 'JPY');
    console.log(`✅ EUR -> JPY: ${eurToJpy}`);
    
    console.log('\n🎉 All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testFiatExchange().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
