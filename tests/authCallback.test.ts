import test from 'node:test';
import assert from 'node:assert/strict';
import {readAuthCallback} from '../src/authCallback';
test('OAuth callback accepts the app address, PKCE codes and legacy email recovery links',()=>{
 assert.deepEqual(readAuthCallback('http://localhost:8081/?code=fictional-code','http://localhost:8081'),{kind:'code',code:'fictional-code'});
 assert.deepEqual(readAuthCallback('foliohealth://auth/callback?code=fictional-code'),{kind:'code',code:'fictional-code'});
 assert.deepEqual(readAuthCallback('http://localhost:8081/#access_token=fictional-access&refresh_token=fictional-refresh&type=recovery','http://localhost:8081'),{kind:'tokens',accessToken:'fictional-access',refreshToken:'fictional-refresh',recovery:true});
 assert.deepEqual(readAuthCallback('http://localhost:8081/?error=access_denied','http://localhost:8081'),{kind:'error'});
 assert.equal(readAuthCallback('https://untrusted.invalid/?code=fictional-code','http://localhost:8081'),null);
 assert.equal(readAuthCallback('https://untrusted.invalid/auth/callback?code=fictional-code'),null);
 assert.equal(readAuthCallback('foliohealth://other/callback?code=fictional-code'),null);
 assert.equal(readAuthCallback('http://localhost:8081/','http://localhost:8081'),null);
});
