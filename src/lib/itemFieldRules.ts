export function itemFieldRules(formKey?: string) {
  const simpleCost = ['confection', 'upholstery', 'upholstery_reform', 'wallpaper'].includes(formKey ?? '')
  return {
    environment: !['confection', 'upholstery', 'upholstery_reform'].includes(formKey ?? ''),
    manufacturerCost: !simpleCost,
    additionalCost: !simpleCost,
  }
}
