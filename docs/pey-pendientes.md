# Pendientes de pey guardados antes de G5

Estado: abiertos. No bloquean el desarrollo de interpretación y propuestas. Sí limitan la habilitación automática del flujo comercial real. Las pruebas bancarias QR y Push de un centavo ya están pagadas y verificadas: el usuario envió desde HSBC y Ramón recibió. No hay evidencia de pago a otra cuenta ni de que falte reflejarse el dinero.

## PEY-001 — Consulta de cuenta registrada en portal devuelve 404

Hecho observado: la cuenta vinculada en portal permitió los cobros diagnósticos; GET /bank-account/:id, usando el ID de la URL de esa cuenta y la clave correspondiente, devolvió 404. El contrato público describe consulta de cuentas registradas mediante API y asociadas a la clave.

Hipótesis sin confirmar: las cuentas creadas en portal y las creadas por API no tienen el mismo alcance de consulta. No afirmar un fallo del pago ni asumir que el ID del portal es utilizable por esa API.

Pregunta a pey: ¿cómo verificar programáticamente nombre, estado y destinatario de la cuenta CoDi vinculada a una API key cuando se creó en el portal? ¿El ID de portal es compatible con GET /bank-account/:id o se requiere otro identificador/registro?

Cierre esperado: procedimiento documentado y consulta autenticada que verifique la cuenta correcta, sin duplicarla ni modificar datos bancarios sin autorización. Mientras tanto no omitir el control de beneficiario del servicio comercial.

## PEY-002 — Significado de metadata.clabe

Hecho observado: en consulta y webhook de los pagos reales, metadata.clabe coincide con la cuenta HSBC de origen del usuario. La documentación la describe como receptora. El comprobante HSBC y la evidencia del portal confirman que Ramón fue el beneficiario. Es una discrepancia de semántica/documentación del campo, no de quién pagó o recibió.

Pregunta a pey: ¿metadata.clabe identifica al pagador en CoDi Push y QR? ¿Qué campo o consulta autenticada acredita la cuenta receptora, especialmente al usar la cuenta vinculada por defecto y no enviar bankAccountId?

Cierre esperado: significado confirmado por flujo y contrato de evidencia del destinatario, con pruebas de regresión. No cambiar silenciosamente la validación de cuenta para tratar cualquier CLABE como receptora ni concluir que todos los flujos la devuelven como origen por estas dos pruebas.

## Evidencia y privacidad

Evidencia bancaria cifrada, recibos y verificaciones en work/ ignorado. No incluir capturas con saldo, teléfonos, claves, CLABE o RFC en commits/ZIP. Las autorizaciones diagnósticas previas no permiten nuevos cobros ni habilitación general.

Fuentes: https://docs.pey.mx/openapi.json y https://docs.pey.mx/docs/types/metadata-response/. Ver docs/progress.md para las verificaciones observadas del 2026-11-07.
