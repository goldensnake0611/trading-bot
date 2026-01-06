
import https from 'https';

const url = 'https://contract.mexc.com/api/v1/contract/detail';

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.success) {
        const river = json.data.find(c => c.symbol.includes('RIVER'));
        if (river) {
          console.log('Found RIVER contract:', river);
        } else {
          console.log('RIVER contract NOT found in futures.');
          // List some others to be sure
          console.log('First 5 contracts:', json.data.slice(0, 5).map(c => c.symbol));
        }
      } else {
        console.log('API returned success: false');
      }
    } catch (e) {
      console.error('Parse error:', e);
    }
  });
}).on('error', (e) => {
  console.error('Request error:', e);
});
