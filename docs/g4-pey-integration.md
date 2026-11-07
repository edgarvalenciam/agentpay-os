# G4 — Adaptador CoDi Push y conciliación (v1.2)

Estado: implementación técnica verificada con fixtures; G4-R bancario pendiente. No se ha enviado ningún cobro ni utilizado la API key real contra pey durante esta entrega.

## Reproducir sin banco

`pnpm typecheck`, `pnpm test` y `pnpm demo:pey`. La demo usa transporte inyectado, identificadores ficticios y bases temporales; prueba API local, firma Standard Webhooks, evidencia cifrada, conciliación y outbox. No usa credenciales privadas ni realiza tráfico hacia pey. `pnpm demo:payments` conserva la demo mock.

## Implementación

El intento y la aceptación idempotente 202 se guardan antes de enviar. El adaptador consulta la cuenta receptora y exige ACTIVE y nombre legal exacto. Convierte centavos a un token decimal exacto, envía metadata plana y registra transactionId/codiId. HTTP 200 nunca significa pagado. Errores de envío ambiguos dejan SUBMISSION_UNKNOWN: no hay reintento automático de POST, tampoco al reiniciar. Un error de preflight que demuestra que no hubo POST permite cancelación local.

La confirmación requiere evidencia autenticada y correlación con el snapshot aprobado. El webhook exige firma sobre bytes originales, API key ID, cuenta, referencia, importe, orden, intento, entorno y fecha. La consulta PAID valida moneda, método, payableType, metadata, desglose sin cargos adicionales y CLABE mediante consulta autenticada de cuenta: el endpoint de transacción no publica numRef ni bankAccountId. PENDING y 404 no se interpretan como rechazo. UNKNOWN sin transactionId no provoca búsquedas inventadas ni un nuevo envío.

El parser conserva los literales monetarios del JSON para rechazar precisión no representable en centavos. La liquidación comparte una transacción para evidencia, pago, orden, reserva/inventario, auditoría y outbox. Un pago tardío conserva la evidencia financiera y genera excepción de cumplimiento cuando no hay reserva válida.

El receptor público y el procesador privado comparten la bandeja cifrada dedicada. Hay leases, backoff y deduplicación de efectos en la DB comercial antes de acusar la bandeja; una caída entre ambos commits se recupera por replay idempotente. No hay transacción distribuida. Las notificaciones siguen siendo una bandeja local; no se envían mensajes externos. Prototipo local, no validado para despliegue distribuido.

## Configuración y prueba bancaria pendiente

Se conservan PAYMENT_PROVIDER=mock y ALLOW_REAL_PAYMENTS=false. La API comercial permanece privada; el túnel expone solo el receptor. El perfil pey requiere API key, API key ID, bankAccountId, nombre legal y teléfono en archivo privado 0600. El configurador `pnpm pey:configure-account` solicita los tres datos de cuenta faltantes sin mostrarlos, sin red y sin activar pagos.

El ID de API key no es el secreto. bankAccountId no es la CLABE: debe corresponder a una cuenta consultable por esa API key mediante GET /bank-account/:id. Que esté activa en el portal no demuestra esa compatibilidad. No se registran cuentas automáticamente.

`pnpm pey:check-account` está preparado para una consulta autenticada de solo lectura y muestra únicamente resultados booleanos. **No se ejecutó durante esta entrega.** La cuenta ACTIVE y CoDi habilitado siguen siendo información aportada por el usuario, no verificación bancaria independiente.

Para enviar se requieren además ambas banderas explícitas de habilitación (archivo y proceso) y una autorización privada por orden, importe, snapshot, cuenta, teléfono y vencimiento. No se creó esa autorización. Antes de una prueba real hay que acordar el importe y beneficiario concretos. No iniciar G5 ni frontend por completar esta implementación.

## Fuentes y límites de evidencia

Contrato documentado: [OpenAPI pey](https://docs.pey.mx/openapi.json), versión consultada 2026-10-20, y [webhook CoDi Push](https://docs.pey.mx/docs/webhooks/codi/pn/). La suite prueba nuestra interpretación mediante fixtures; no acredita interoperabilidad bancaria real. No se documenta idempotencia upstream: no se asume. QR, Payment Links, alta de cuentas, reembolsos y pagos a terceros no están implementados por este adaptador.

## Revisión de identificadores — 2026-11-07

La revisión de OpenAPI confirma GET /transaction/api-key: identifica la clave desde Authorization y no requiere apiKeyId. Permite verificar acceso y consultar transacciones, pero el esquema de respuesta no expone apiKeyId ni un inventario de cuentas. No se encontró en la API pública revisada un endpoint para recuperar el perfil/ID de la clave. No sustituir por ID de usuario ni inferir IDs de tokens opacos de paginación.

POST /codi/pn no requiere apiKeyId; bankAccountId es opcional y, si se omite, pey usa la cuenta CoDi vinculada a la clave. El webhook solo incluye bankAccountId cuando se envió explícitamente. Estos son hechos del contrato; exigir ambos identificadores antes del envío es una política adicional de AgentPay, no un requisito de autenticación de pey. No se ha eliminado la validación del beneficiario ni se ha activado un modo de cuenta predeterminada sin comprobarla.

Se agregó pnpm pey:check-key, una única consulta GET autenticada de solo lectura. Descarta el cuerpo financiero, no imprime secretos/IDs/transacciones y no cambia configuración. No requiere los IDs pendientes. Preparado y probado con transporte ficticio; no ejecutado contra pey. Un 200 acredita acceso al endpoint, no cuenta ACTIVE ni entrega de CoDi. Los webhooks auténticos pueden proporcionar apiKeyId; la bandeja local sigue siendo una fuente de evidencia, no se generan pagos para descubrir identificadores.

Fuentes: https://docs.pey.mx/openapi.json y https://docs.pey.mx/docs/webhooks/codi/pn/ (consultadas 2026-11-07).
