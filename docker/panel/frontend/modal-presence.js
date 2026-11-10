// Mantém o portal montado até a animação de saída terminar.
export function createModalPresence(){
 const entries=new Map(),listeners=new Set();let snapshot=[];
 const emit=()=>{snapshot=[...entries.values()];for(const listener of listeners)listener();};
 return {subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},snapshot:()=>snapshot,
 set(key,props){entries.set(key,{key,props,leaving:false});emit();},
 leave(key){const entry=entries.get(key);if(entry){entries.set(key,{...entry,leaving:true});emit();}},
 remove(key){if(entries.delete(key))emit();}};
}
