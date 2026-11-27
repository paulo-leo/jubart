export function executionPermission(key,action){
 const missingScopes=key?.scopes?.includes('execute')?[]:['execute'],missingActions=key?.actions?.includes(action)?[]:[action];
 return {allowed:!missingScopes.length&&!missingActions.length,requiredScopes:['execute'],requiredActions:[action],missingScopes,missingActions};
}
export function requireExecution(key,action){
 const permission=executionPermission(key,action);if(permission.allowed)return;
 throw Object.assign(new Error('Permissão necessária: '+[...permission.missingScopes,...permission.missingActions].join(', ')+'.'),{status:403,code:'MCP_PERMISSION_REQUIRED',...permission});
}
