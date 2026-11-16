export function customerAddressLines(address:string):string[]{
 const text=address.trim()
 if(!text)return []
 const explicit=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean)
 if(explicit.length>1)return explicit
 const marker=/\s+[–—-]\s+(?=Bairro\b)|\s*·\s*/i.exec(text)
 if(!marker)return [text]
 return [text.slice(0,marker.index).trim(),text.slice(marker.index+marker[0].length).trim()].filter(Boolean)
}
export function CustomerAddress({address}:{address:string}){
 return <span style={{display:'block',fontSize:'11px',lineHeight:1.45,marginTop:4,fontWeight:400,overflowWrap:'anywhere'}}>{customerAddressLines(address).map((line,index)=><span key={index} style={{display:'block',fontSize:'inherit',lineHeight:'inherit',margin:0}}>{line}</span>)}</span>
}
