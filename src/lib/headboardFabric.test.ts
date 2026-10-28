import {describe,it,expect} from 'vitest'
import {headboardFabric,calculateUpholsteryEstimate,newUpholsteryEstimate,type UpholsteryPiece} from './upholsteryEstimate'
const piece:UpholsteryPiece={id:'1',name:'Cabeceira',width:3.4,height:1.1,piece_thickness:10,thickness:5,density:'d28',fabric_reference:'Linho',module_count:6,cost_per_square_meter:100}
describe('tecido por módulos',()=>{
 it('divide a largura total sem multiplicar a frente novamente',()=>{const r=headboardFabric(piece)!;expect(r.front).toBe(3.4);expect(r.module_width).toBeCloseTo(3.4/6,6);expect(r.sides).toBe(1.2);expect(r.finish).toBe(.48);expect(r.meters).toBe(5.08)})
 it('acrescenta a largura total quando o verso é tapeçado',()=>expect(headboardFabric({...piece,back_upholstered:true})!.meters).toBe(8.48))
 it('usa a espessura total da peça, não a da espuma',()=>expect(headboardFabric({...piece,thickness:20})!.meters).toBe(5.08))
 it('preserva estimativas sem módulos e rejeita contagem inválida',()=>{expect(headboardFabric({...piece,module_count:undefined})).toBeNull();expect(headboardFabric({...piece,module_count:0})).toBeNull();expect(headboardFabric({...piece,module_count:1.5})).toBeNull()})
 it('soma módulos por tecido sem aplicar o arredondamento antigo de meio metro',()=>{const e={...newUpholsteryEstimate(),pieces:[piece,{...piece,id:'2'}]};expect(calculateUpholsteryEstimate(e).suggested_fabric_meters).toBe(10.16);expect(calculateUpholsteryEstimate({...e,fabric_meters_manual:12}).fabric_meters).toBe(12)})
 it('não altera área de espuma nem custo de mão de obra por m²',()=>{const a=calculateUpholsteryEstimate({...newUpholsteryEstimate(),pieces:[piece]});const b=calculateUpholsteryEstimate({...newUpholsteryEstimate(),pieces:[{...piece,module_count:12,back_upholstered:true}]});expect(a.foam_quantity).toBe(b.foam_quantity);expect(a.upholstery_cost).toBe(b.upholstery_cost)})
})
