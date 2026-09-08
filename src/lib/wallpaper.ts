export type WallpaperDetails={brand:string;collection:string;reference:string;color:string;wall_width:number;wall_height:number;roll_width:number;roll_length:number;rolls:number}

export const blankWallpaper:WallpaperDetails={brand:'',collection:'',reference:'',color:'',wall_width:0,wall_height:0,roll_width:0,roll_length:0,rolls:1}

const measure=(value:number)=>value>0?value.toLocaleString('pt-BR',{maximumFractionDigits:3}):''

export function wallpaperDescription(value:WallpaperDetails){
 const identity=[value.brand,value.collection,value.reference,value.color].map(item=>item.trim()).filter(Boolean).join(' - ')
 const wall=value.wall_width>0&&value.wall_height>0?`Parede medindo ${measure(value.wall_width)} × ${measure(value.wall_height)} m`:''
 const roll=value.roll_width>0&&value.roll_length>0?`rolo de ${measure(value.roll_width)} × ${measure(value.roll_length)} m`:''
 const quantity=value.rolls>0?`${value.rolls} rolo(s)`:''
 return [`Papel de parede${identity?` ${identity}`:''}`,wall,[quantity,roll].filter(Boolean).join(', ')].filter(Boolean).join('. ')+'.'
}
