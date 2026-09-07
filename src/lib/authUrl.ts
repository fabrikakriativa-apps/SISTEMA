export function cleanAuthenticationFragment(location:Pick<Location,'pathname'|'search'|'hash'>){
 return /(?:^|&)access_token=/.test(location.hash.replace(/^#/,'')) ? `${location.pathname}${location.search}` : null
}
