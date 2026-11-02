# Homologação de orientações e retenção por conversa

Implementado no SISTEMA: notas internas, aprovação de regras, botões Segurar e Liberar vinculados à conversa. A migração `20261102030252_kiara_hold_idempotent_release.sql` já foi aplicada ao projeto SISTEMA.

O Worker candidato foi validado fora de produção com seis cenários simulados: bloqueio antes de gerar, aplicação das instruções somente na IA, bloqueio durante geração, respeito à intervenção humana, falha de banco impedindo envio e liberação reagendando o último lote uma única vez mesmo com clique repetido.

A versão atual publicada do WhatsApp não foi alterada. A ativação depende de testar o Worker candidato no ambiente isolado, configurar os endpoints e preservar controle geral desabilitado até homologação. Consultas ao banco e chamadas ao WhatsApp não formam uma transação; uma pausa estritamente simultânea ao envio pode exigir serialização adicional.
