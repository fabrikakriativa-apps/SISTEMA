import {describe,it,expect} from 'vitest'
import {blankWallpaperEstimate as b,calculateWallpaperEstimate as calc,wallpaperEstimateDescription,wallpaperItemCosts,recoverWallpaperItemCosts} from './wallpaperEstimate'
describe('papel de parede',()=>{
 it('transfere rolos, instalação e outros custos para o item',()=>{const value={...b,rolls_manual:5,roll_cost:100,additional:30};const costs=wallpaperItemCosts(value);expect(costs).toEqual({manufacturer_cost:500,additional_cost:580});expect(costs.manufacturer_cost+costs.additional_cost).toBe(calc(value).cost)})
 it('recupera estimativa salva sem depender do preço de venda',()=>expect(recoverWallpaperItemCosts({...b,rolls_manual:3,roll_cost:200})).toEqual({manufacturer_cost:600,additional_cost:350}))
 it.each([undefined,null,{}, {...b,rolls_manual:3}, {...b,roll_cost:100}])('não inventa custo para estimativa incompleta %s',value=>expect(recoverWallpaperItemCosts(value)).toBeNull())
 it('usa perda de 25 cm e arredonda faixas e rolos',()=>{const r=calc({...b,wall_width:4,wall_height:2.5,roll_width:.5,roll_length:10});expect(r.yieldPerRoll).toBe(3);expect(r.rolls).toBe(3);expect(r.labor).toBe(350)})
 it.each([[3,350],[4,450],[5,550]])('mão de obra para %s rolos', (rolls,cost)=>expect(calc({...b,rolls_manual:rolls}).labor).toBe(cost))
 it('inclui rapport e preserva ajustes manuais',()=>{const r=calc({...b,wall_width:4,wall_height:2.5,roll_width:.5,roll_length:10,rapport:true});expect(r.yieldPerRoll).toBe(2);expect(r.rolls).toBe(4);expect(calc({...b,rolls_manual:5,labor_manual:600,roll_cost:100}).cost).toBe(1100)})
 it('usa somente código interno no documento',()=>expect(wallpaperEstimateDescription({...b,code:'FK-0001',name:'Aditare 3'})).toContain('Aditare 3 - FK-0001'))
})
