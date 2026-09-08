import {describe,expect,it} from 'vitest'
import {blankWallpaper,wallpaperDescription} from './wallpaper'

describe('descrição de papel de parede',()=>{
 it('mantém os dados comerciais e as medidas confirmadas',()=>expect(wallpaperDescription({...blankWallpaper,brand:'Marca',collection:'Linha',reference:'REF 10',color:'Areia',wall_width:4.2,wall_height:2.7,roll_width:.53,roll_length:10,rolls:3})).toBe('Papel de parede Marca - Linha - REF 10 - Areia. Parede medindo 4,2 × 2,7 m. 3 rolo(s), rolo de 0,53 × 10 m.'))
 it('não inventa medidas ausentes',()=>expect(wallpaperDescription(blankWallpaper)).toBe('Papel de parede. 1 rolo(s).'))
})
