export function itemFieldRules(formKey?: string) {
  const simpleCost = ['confection', 'upholstery', 'upholstery_reform', 'wallpaper'].includes(formKey ?? '')
  return {
    environment: true,
    manufacturerCost: !simpleCost,
    additionalCost: !simpleCost,
  }
}
