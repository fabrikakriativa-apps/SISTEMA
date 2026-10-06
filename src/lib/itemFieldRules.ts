export function itemFieldRules(formKey?: string) {
  const simpleCost = ['confection', 'upholstery', 'wallpaper'].includes(formKey ?? '')
  return {
    environment: !['confection', 'upholstery'].includes(formKey ?? ''),
    manufacturerCost: !simpleCost,
    additionalCost: !simpleCost,
  }
}
