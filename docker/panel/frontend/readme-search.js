const fold=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function findReadmeMatches(text,query){
 const needle=fold(query.trim());if(!needle)return [];
 let normalized='',offset=0;const positions=[];
 for(const char of text){const part=fold(char);for(let i=0;i<part.length;i++)positions.push([offset,offset+char.length]);normalized+=part;offset+=char.length;}
 const ranges=[];let cursor=0;
 while(cursor<=normalized.length-needle.length){const start=normalized.indexOf(needle,cursor);if(start<0)break;ranges.push([positions[start][0],positions[start+needle.length-1][1]]);cursor=start+needle.length;}
 return ranges;
}
// Transformação HAST: o termo é texto literal, nunca HTML ou expressão regular.
export function highlightReadme(options){return tree=>{
 if(!options.query.trim())return;
 const visit=node=>{if(!node.children)return;const next=[];for(const child of node.children){if(child.type!=='text'){visit(child);next.push(child);continue;}const ranges=findReadmeMatches(child.value,options.query);let cursor=0;for(const [start,end]of ranges){if(start>cursor)next.push({type:'text',value:child.value.slice(cursor,start)});next.push({type:'element',tagName:'mark',properties:{'data-readme-match':'true'},children:[{type:'text',value:child.value.slice(start,end)}]});cursor=end;}if(cursor<child.value.length||!ranges.length)next.push({type:'text',value:child.value.slice(cursor)});}node.children=next;};visit(tree);
};}
