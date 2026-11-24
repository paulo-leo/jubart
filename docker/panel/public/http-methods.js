// Empty selection preserves the default: forward all HTTP methods.
export const HTTP_METHODS=Object.freeze(['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']);
export function normalizeHTTPMethods(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>HTTP_METHODS.length||value.some(method=>typeof method!=='string'||!HTTP_METHODS.includes(method.toUpperCase())))throw new Error('Métodos HTTP inválidos. Selecione GET, HEAD, POST, PUT, PATCH, DELETE ou OPTIONS; deixe vazio para permitir todos.');
 return HTTP_METHODS.filter(method=>value.some(item=>item.toUpperCase()===method));
}
