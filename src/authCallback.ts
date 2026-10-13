export type AuthCallback = {kind:'code';code:string;flowId?:string}|{kind:'tokens';accessToken:string;refreshToken:string;recovery:boolean}|{kind:'error'};
// Only accept authentication callbacks addressed to this app. Never log callback URLs.
export function readAuthCallback(value:string,webOrigin?:string):AuthCallback|null{
 let url:URL;try{url=new URL(value);}catch{return null;}
 if(webOrigin){if(url.origin!==webOrigin||!['/','/auth/callback'].includes(url.pathname))return null;}
 else if(url.protocol!=='foliohealth:'||!((url.hostname==='auth'&&url.pathname==='/callback')||(!url.hostname&&url.pathname==='/')))return null;
 const fragment=new URLSearchParams(url.hash.slice(1));
 if(url.searchParams.has('error')||fragment.has('error'))return {kind:'error'};
 const code=url.searchParams.get('code');if(code){const flowId=url.searchParams.get('sb_flow_id');return flowId?{kind:'code',code,flowId}:{kind:'code',code};}
 const accessToken=fragment.get('access_token'),refreshToken=fragment.get('refresh_token');
 if(accessToken&&refreshToken)return {kind:'tokens',accessToken,refreshToken,recovery:fragment.get('type')==='recovery'};
 return null;
}
