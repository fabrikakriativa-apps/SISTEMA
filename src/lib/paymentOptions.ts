export type ItemPaymentOption={id?:string;position:number;description:string;adjustment_percent:number;final_value:number|null;observation:string}

const twoDecimals=(value:number)=>Number(Math.max(0,value).toFixed(2))

export const finalValueFromAdjustment=(saleTotal:number,adjustment:number)=>twoDecimals(Math.max(0,saleTotal)*(1+adjustment/100))
export const adjustmentFromFinalValue=(saleTotal:number,finalValue:number)=>saleTotal>0?Number((((finalValue/saleTotal)-1)*100).toFixed(6)):0
export const optionFinalValue=(saleTotal:number,option:Pick<ItemPaymentOption,'adjustment_percent'|'final_value'>)=>option.final_value===null?finalValueFromAdjustment(saleTotal,option.adjustment_percent):twoDecimals(option.final_value)

export const standardItemPaymentOptions=():ItemPaymentOption[]=>[
  {position:1,description:'À vista (PIX)',adjustment_percent:-6,final_value:null,observation:'No ato da aprovação do orçamento'},
  {position:2,description:'Em até 3x no cartão de crédito',adjustment_percent:0,final_value:null,observation:'No ato da aprovação do orçamento'}
]
