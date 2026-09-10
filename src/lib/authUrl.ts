export function cleanAuthenticationFragment(location:Pick<Location,'pathname'|'search'|'hash'>){
 return /(?:^|&)access_token=/.test(location.hash.replace(/^#/,'')) ? `${location.pathname}${location.search}` : null
}

export function applicationRedirectUrl(origin:string,basePath:string){
 return new URL(basePath,origin).toString()
}
