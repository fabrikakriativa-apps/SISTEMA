export function cancellationNote(notes:string|null,reason:string,at:string){
 const clean=reason.trim()
 if(clean.length<5)throw new Error('Informe o motivo do cancelamento (mínimo de 5 caracteres).')
 return [notes?.trim(),`Cancelado em ${new Date(at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}: ${clean}`].filter(Boolean).join('\n')
}

