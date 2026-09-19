export type ItemPaymentOption={id?:string;position:number;description:string;adjustment_percent:number;observation:string}
export const standardItemPaymentOptions=():ItemPaymentOption[]=>[
  {position:1,description:'À vista (PIX)',adjustment_percent:-6,observation:'No ato da aprovação do orçamento'},
  {position:2,description:'Em até 3x no cartão de crédito',adjustment_percent:0,observation:'No ato da aprovação do orçamento'},
]
export const optionFinalValue=(saleTotal:number,adjustment:number)=>Number((Math.max(0,saleTotal)*(1+adjustment/100)).toFixed(2))
