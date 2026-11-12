// One card per component. Steps keep their narrative order and reuse the links on return.
export function architectureFlow(route,mode){
 const cards=[];const byId=new Map();
 route.forEach((step,index)=>{if(!byId.has(step.node)){const card={id:step.node,steps:[]};cards.push(card);byId.set(step.node,card);}byId.get(step.node).steps.push(index);});
 cards.forEach((card,index)=>{const row=Math.floor(index/4),column=index%4;card.x=130+(row%2?3-column:column)*280+(cards.length<4?(4-cards.length)*140:0);card.y=100+row*180;});
 // The error page branches from the proxy, rather than adding a second proxy to the flow.
 if(mode==='error'&&byId.has('errors')&&byId.has('proxy')){['client','proxy','app'].forEach((id,i)=>{if(byId.has(id)){byId.get(id).x=270+i*280;byId.get(id).y=100;}});byId.get('errors').x=byId.get('proxy').x;byId.get('errors').y=280;}
 const edges=new Map(),steps=route.map((step,index)=>{
  if(!index||step.node===route[index-1].node)return null;
  const from=route[index-1].node,to=step.node,key=[from,to].sort().join(':'),a=byId.get(from),b=byId.get(to);let points;
  if(a.y===b.y){const sign=Math.sign(b.x-a.x);points=[{x:a.x+sign*104,y:a.y},{x:b.x-sign*104,y:b.y}];}
  else if(a.x===b.x){const sign=Math.sign(b.y-a.y);points=[{x:a.x,y:a.y+sign*65},{x:b.x,y:b.y-sign*65}];}
  else if(b.y<a.y){const sign=Math.sign(b.x-a.x),gutter=a.x+sign*135,mid=(a.y+b.y)/2;points=[{x:a.x+sign*104,y:a.y},{x:gutter,y:a.y},{x:gutter,y:mid},{x:b.x,y:mid},{x:b.x,y:b.y+65}];}
  else{const sign=Math.sign(b.y-a.y),mid=(a.y+b.y)/2;points=[{x:a.x,y:a.y+sign*65},{x:a.x,y:mid},{x:b.x,y:mid},{x:b.x,y:b.y-sign*65}];}
  const link={key,from,to,index,points,path:points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ')};
  if(!edges.has(key))edges.set(key,[]);edges.get(key).push(link);return link;
 });
 return {cards,steps,edges:[...edges.values()],height:Math.max(...cards.map(c=>c.y),100)+100};
}
export function visibleArchitectureLinks(flow,index){return flow.edges.map(visits=>visits.filter(link=>link.index<=index).at(-1)||visits[0]);}
export function pointOnFlow(link,ratio){
 if(!link)return {x:0,y:0,angle:0};
 const segments=link.points.slice(1).map((b,i)=>{const a=link.points[i];return {a,b,length:Math.hypot(b.x-a.x,b.y-a.y)};}).filter(s=>s.length>0);
 let remaining=Math.max(0,Math.min(1,ratio))*segments.reduce((sum,s)=>sum+s.length,0);
 for(let i=0;i<segments.length;i++){const {a,b,length}=segments[i];if(remaining<=length||i===segments.length-1){const t=remaining/length;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI};}remaining-=length;}
 return {...link.points[0],angle:0};
}
