# Registro de avance — AgentPay OS

**Última actualización documental:** 2026-11-07 (v1.2)

| Fase | Estado | Evidencia | Bloqueo |
|---|---|---|---|
| 0 — Pey documental (G0-D) | Documentación revisada y contrastada | Capacidades y pruebas reales documentadas | PEY-001 y PEY-002 abiertos |
| 0 — Pey operativo (G0-R) | Pruebas diagnósticas verificadas | API autenticada y QR/Push pagados | Cuenta comercial compatible y PEY-001/002 |
| 1 — Core (G1) | APROBADO | 47 tests; typecheck sin errores | Ninguno para G1 |
| 2 — API/DB (G2) | APROBADO | 72 tests, typecheck, 3 migraciones y demo HTTP | Local, un proceso; sin pagos |
| 3 — Mock/conciliación (G3) | APROBADO | 122 tests, typecheck, demo HTTP SIMULADO | No valida integración bancaria |
| 4 — Pey real (G4) | Diagnósticos bancarios QR y Push pagados; integración comercial pendiente | Ambos API PAID + webhooks firmados; evidencia bancaria | Cuenta portal no consultable (404); discrepancia metadata.clabe; no E2E comercial real |
| 5 — OpenAI (G5) | Código implementado; validación con modelo real pendiente | 76 tests nuevos, suite 332/332, demo ficticia | Clave/modelo guardados; prueba real rechazada por saldo API agotado (429) |
| 6 — Frontend (G6) | NO INICIADA | — | — |
| 7 — E2E/demo (G7) | NO INICIADA | — | — |

**Estado actual: core/API/pagos y agente ejecutables. Pruebas bancarias aisladas QR/Push confirmadas; flujo comercial y agente verificados con fixtures. No equivalen a habilitación comercial real ni evaluación de un modelo real.**

## Evidencias por ejecución

Codex debe anexar para cada gate: fecha, archivos modificados, comandos ejecutados, pruebas pasadas/fallidas, capturas o salidas sanitizadas, asuntos pendientes, decisión de avanzar o detenerse. No marcar `[x]` sin evidencia.

## Ejecución 2026-11-07 — G0-D y G1

- Base: ZIP AgentPay-v1_2 y cinco TXT complementarios idénticos al contenido correspondiente del ZIP.
- Commit base: `32ec9ea` — importación íntegra del starter v1.2. Commit de implementación: consultar `git log -1` (el registro se incluye en ese mismo commit).
- Archivos: configuración pnpm/TypeScript y lockfile; `packages/core/src/{models,policies,orders,payments,index}.ts`; `packages/core/tests/core.test.ts`; arquitectura, roadmap, AGENTS y revisión pey actualizados.
- G0-D: contraste independiente de OpenAPI y documentación pública; diferencias registradas en `pey-review-2026-11-07.md`.
- `pnpm install`: aprobado tras habilitar únicamente build de esbuild. Incidencias iniciales resueltas: red restringida, configuración allowBuilds requerida y Node ausente del PATH de la terminal. Se usó el Node incluido en el runtime de Codex añadiendo su carpeta al PATH de esta sesión; no se modificó la configuración del equipo.
- `pnpm test`: **47/47 aprobadas**, 1 archivo. Primera ejecución: 45/46, fallo de una aserción que contaba checks; sustituida por la comprobación de aprobación de cada check. Se agregó prueba de cumplimiento tras confirmar pago; última ejecución 47/47.
- `pnpm typecheck`: **aprobado**, salida 0, TypeScript strict.
- `git diff --check`: aprobado tras retirar espacios finales de una línea del roadmap. Instalación con `--frozen-lockfile`, 47 tests y typecheck repetidos al cierre con salida 0.
- Evidencia: $850 frente a presupuesto $1,000 elegible; $1,200 rechazado; ausencia/cambio de datos críticos rechazada; consentimiento se invalida ante cambio de precio, producto, entrega, cuenta, teléfono, intención, método o versión; snapshot congelado; replay estable y conflicto idempotente; sin resubmission tras UNKNOWN; cumplimiento bloqueado antes de confirmación.
- G1 aprobado. No iniciar Fase 2 en esta entrega. No existen HTTP, DB, proveedores mock/reales, OpenAI ni frontend.
- Riesgo pendiente: idempotencia durable, concurrencia, firma y conciliación requieren G2/G3/G4; pruebas unitarias no demuestran operación bancaria. No se usaron credenciales ni se generaron cobros.
- G0-R sigue bloqueado por habilitación/cuenta/pagador y autorización financiera explícita; no impide aprobar el dominio G1.

## Ejecución 2026-11-07 — Fase 2 / G2

- Autorización: usuario indicó avanzar tras definir Fase 2. Base local `a303c2f` (G1); implementación G2 registrada en el siguiente commit, consultar historial por mensaje `feat(api): complete G2 transactional API and persistence`.
- Entregables: `apps/api` (Fastify, auth por actor, servicio transaccional y servidor loopback), `packages/contracts` (Zod), `packages/database` (Prisma/SQLite, 19 modelos, tres migraciones, seed no destructivo, unidad de trabajo), scripts de migración/demo; roadmap, AGENTS, arquitectura y contratos actualizados.
- Operaciones: crear/consultar intención, listar/evaluar ofertas, reservar propuesta, aprobar orden ligada a hash, consultar orden/eventos y listar órdenes del comercio. No hay endpoints de cobro o preparación.
- Persistencia atómica: orden/snapshot/consentimiento/auditoría/outbox interno/respuesta idempotente. Duplicados sobreviven al reinicio; payload distinto genera 409. Una orden por intención; concurrencia sobre propuestas alternativas produce 201/409 sin duplicar compra.
- Integridad: unicidad de slot activo de intento por orden, recursos por proveedor/tipo/id y transacciones por proveedor/id; recurso permite múltiples transacciones. Triggers impiden actualizar snapshot/consentimiento y alterar/borrar auditoría. Tests de pagos son solo inserts sintéticos para probar constraints, no gateway mock.
- Comandos reales aprobados: `pnpm install --frozen-lockfile`; `pnpm db:generate`; `pnpm db:migrate` (3 migraciones aplicadas de forma incremental, sin reset); `pnpm db:seed`; `pnpm typecheck` (salida 0); `pnpm test` (**72/72**, 47 core + 25 integración); `pnpm demo` (HTTP real loopback, repetición, reinicio, cuatro eventos, cero intentos financieros); `git diff --check` (advertencia de línea vacía final del SQL generado corregida en cierre; sin cambio de sentencias).
- Pruebas adversas: suplantación mediante body; acceso ajeno de compradores/comercios; duplicados simultáneos; stock compartido; timeout/UNKNOWN del core; monto $1,200 rechazado; precio/beneficiario/teléfono/versión/merchant/cuenta cambiados; reserva vencida; rollback; evidencia inmutable; seed repetido; lifecycle CLI y rechazo de segunda instancia.
- Incidencias resueltas: primera instalación bloqueada por red del entorno; instalación posterior autorizada y completada. Prisma no resolvía cliente por disposición pnpm: CLI y cliente instalados juntos en paquete database. Engine de migraciones fallaba al crear archivo ausente: wrapper crea archivo vacío 0600 sin truncar. Primeras 19 pruebas de integración fallaron por ese arranque, luego 19/19, 23/23 y finalmente 25/25 tras agregar restricciones y ciclo del servidor. No se ocultan fallos como éxitos de integración bancaria.
- Privacidad: tokens fuera del repo y teléfonos demo sintéticos; orden/eventos/outbox no exponen teléfono, texto libre ni datos bancarios. HTTP/Prisma sin logs. DB local no cifrada; no apto para datos reales/producción.
- G2 aprobado; G3 no iniciado. No frontend, OpenAI, llamadas pey, webhooks operativos, envío de pagos ni credenciales reales. No se publicó a remoto.
- Bloqueos para G2: ninguno. Límites: SQLite local un proceso, seed/CLI con servidor detenido, lock residual tras cierre forzado se revisa manualmente, auth solo demo, listados limitados a 100 sin paginación todavía. Outbox no despachado. Próximo gate G3 implementa mock explícito, conciliación y despacho idempotente; G0-R sigue pendiente para pagos reales.

## Ejecución 2026-11-07 — Fase 3 / G3

- Autorización: «continuemos con el siguiente fase». Base `f2549de` (G2); implementación identificable por commit `feat(payments): complete G3 mock reconciliation and durable outbox`.
- Archivos: `core/reconciliation.ts` y transiciones; paquete `integrations` mock/firma; `api/payment-service.ts`, `api/outbox.ts`, rutas/arranque; schemas compartidos, schema Prisma y migración 004; `tests/payments.test.ts`, tests de dinero y demo HTTP; documentación/AGENTS/roadmap actualizados.
- Gateway CODI_PUSH solo mock: ledger durable e IDs mock-, sin llamadas HTTP al proveedor. Commit del intento, slot, auditoría y respuesta 202 antes de submit. Timeout deja UNKNOWN; misma clave repite aceptación sin submit y otra clave se bloquea. Startup no reenvía intentos huérfanos.
- Evento de desarrollo HMAC sobre bytes originales; protocolo propio, no Standard Webhooks pey. Correlación de monto/moneda/cuenta/API key/orden/intento/referencia/transacción, fecha y ledger. Deduplicación durable por entrega y transacción; confirmación temprana no se rebaja al llegar recibo.
- Transacción atómica para evento, pago, orden, inventario/reserva, auditoría y outbox. Confirmado tardío conserva pago pero entra a FULFILLMENT_EXCEPTION. No devolución ni preparación automática.
- Worker con lease/reintentos entrega a MerchantNotification (bandeja local simulada), dedup eventId incluso si falla entre entrega y acuse. No se envían mensajes a personas ni servicios externos.
- Comandos ejecutados: `pnpm install` / `pnpm install --frozen-lockfile`; `pnpm db:generate`; `pnpm db:migrate` (**4 migraciones**, actualización incremental local); `pnpm typecheck` (**salida 0**); `pnpm test` (**122/122**, cuatro archivos: 47 core inicial + 14 dinero + 25 G2 + 36 G3/upgrade); `pnpm demo` (regresión G2 sin pagos); `pnpm demo:payments` (flujo HTTP simulado completo con reinicio y una notificación); `git diff --cached --check` en cierre.
- Casos adversos aprobados: 8 solicitudes simultáneas → 1 submit; claves/cuerpos en conflicto; timeout antes/después de aceptación y reinicio; intento huérfano; precio/beneficiario/teléfono/stock/cuenta/reserva/consentimiento cambiado; acceso ajeno/operador; firma ausente/alterada/vencida/futura/otro secreto; montos inexactos y correlación incorrecta; evento real bloqueado; duplicados entrega/transacción; callback antes de recibo; falta de autorización no equivale a fallo pey; pago tardío; recuperación por consulta; outbox con entrega sin acuse y lease vencido.
- Upgrade validado con una DB G2 que contiene orden, snapshot, consentimiento, auditoría y outbox: datos y restricciones/triggers inmutables conservados, sin violaciones de claves foráneas. Migración 004 no modifica las tres migraciones anteriores.
- Incidencias: instalación offline no pudo verificar metadata de dependencias existentes; instalación normal posterior completada tras acceso de red. No se añadieron SDKs financieros ni dependencias de firma. Primera ejecución de suite G3: 121/121; agregada prueba de upgrade: 122/122; verificación final de etiquetas: 122/122. Tras añadir etiqueta mock a recuperación de startup, regresión focalizada de pagos 36/36 y typecheck aprobados.
- G3 aprobado. Sin frontend, OpenAI, claves pey, webhook pey operativo ni operaciones bancarias reales. Mocks y respuestas etiquetados SIMULADO; controles requieren token distinto del comprador.
- Bloqueos G3: ninguno. Límites: servidor y DB locales, un proceso, firma mock distinta de pey, sink de notificaciones solo local, sin garantía exactly-once externa. G4 no iniciado; contratos reales, Standard Webhooks, habilitación y prueba bancaria autorizada siguen pendientes. No se publicó a remoto.

## Ejecución 2026-11-07 — URL pública / G4 parcial

- Autorización: usuario solicitó crear la URL y facilitó teléfono. Teléfono guardado solo en configuración privada 0600; no se imprime ni se incorpora al repo/entregables.
- Receptor dedicado en loopback, expuesto con Quick Tunnel de Cloudflare. Instalación local portable cloudflared 2026.10.7 desde release oficial, digest SHA-256 verificado. No instalación global ni exposición del servidor comercial.
- Nuevos archivos: verificador SDK Standard Webhooks, carga de config privada, receptor/arranque dedicado, scripts de up/down/configuración oculta, modelo/migración 005 PeyWebhookInbox, 15 tests y guía operativa.
- Validación de firma oficial sobre cuerpo crudo, deduplicación deliveryId/hash, payload cifrado AES-256-GCM y acuse solo después de persistir. Ninguna transición financiera: estado VERIFIED_PENDING_RECONCILIATION.
- Comandos observados: instalación normal y generación Prisma aprobadas; typecheck salida 0; test focalizado 15/15; suite completa 137/137 (5 archivos). Quinta migración aplicada a DB dedicada. Comando up repetido conserva URL y procesos vivos.
- HTTPS verificado desde conexión pública: GET /health 200 waiting_for_webhook_secret; POST /v1/webhooks/pey 503 sin secreto; /v1/orders y controles mock 404. Logs sin cuerpos/PII. URL vigente en estado privado de runtime e informe de outputs, no fijada en código.
- Los procesos quedan activos en segundo plano por autorización del usuario. URL temporal depende de Mac encendida/conectada; se puede detener con webhook:down.
- Estado G4 parcial, no aprobado como integración bancaria. Pendiente: registrar URL en portal y guardar secreto local; implementar transporte y conciliación pey; fijar monto/beneficiario antes de cualquier prueba real. Cuenta ACTIVE y CoDi reportados por usuario, sin consulta autenticada independiente. API key real no utilizada; cero cobros.
- Commit identificable por mensaje feat(webhooks): add isolated pey receiver and temporary URL tooling. Sin publicación de código a remoto.

- Incidencia operativa resuelta: restricciones del entorno impedían inspeccionar/señalizar procesos previos (EPERM). El launcher ahora trata EPERM como proceso existente en vez de asumir que terminó; no relanza una sesión incompleta. Se verificaron los procesos propios con permisos adecuados, se cerró un túnel duplicado y se conservó un único receptor/túnel con estado corregido. Pruebas HTTPS posteriores y reuso de URL aprobados. Down no borra estado si no puede verificar o detener procesos.

## Confirmación de configuración — 2026-11-07

El usuario completó la entrada local del secreto. Verificación por GET /health local y por URL HTTPS pública: 200, status=ready, realPaymentsEnabled=false. Esto acredita que el receptor pudo cargar la configuración de firma; no acredita todavía una entrega auténtica de pey ni conciliación financiera. No se leyó ni imprimió el secreto, no se enviaron eventos financieros ni se generaron cobros. Continúan pendientes el adaptador de envío, la conciliación real, configuración local de API key/beneficiario y la definición concreta de monto antes de la prueba bancaria.

## Configurador privado de API key — 2026-11-07

Usuario solicitó un mecanismo similar al del secreto de webhook. Se agregó pey:configure-key y helper local .command con entrada oculta. Guardado atómico 0600, preservando configuración existente y pagos deshabilitados; sin red y sin imprimir valores. Entrada y guardado privados compartidos con configurador de webhook. Cinco pruebas focalizadas aprobadas y typecheck salida 0. No se ha solicitado ni recibido la API key en el chat; este cambio solo prepara su captura local por el usuario. No valida credenciales contra pey ni realiza cobros.

## Confirmación de API key local — 2026-11-07

Usuario completó configurador privado. Se verificaron únicamente indicadores: API key presente, secreto de webhook conservado, archivo regular con permisos 0600, ALLOW_REAL_PAYMENTS=false y PAYMENT_PROVIDER=mock. No se imprimieron valores ni se utilizó la key contra pey. Tras habilitar acceso de red de esta sesión, receptor local y URL HTTPS devolvieron 200/ready; webhook:up reutilizó la URL vigente sin reemplazarla. El primer chequeo local de la sesión no conectó; verificación posterior local y pública satisfactoria. Pendientes: validar credenciales mediante operación autorizada, adaptador de envío y conciliación real, y monto/beneficiario concretos antes de cualquier cobro.

## Ejecución 2026-11-07 — Implementación técnica G4

- Autorización: «ok hagamoslo» tras propuesta de adaptador y conciliación. Gateway CoDi Push, consulta de cuenta/transacción, configuración privada, servicio de pagos, liquidación compartida, procesador cifrado con leases y migración 006 implementados. Sin frontend ni G5.
- Evidencia final observada: pnpm typecheck salida 0; pnpm test: **195/195, 8 archivos**, 20.34 s; pnpm demo:pey salida 0, credenciales reales utilizadas 0 y cobros bancarios 0. Demo mock de regresión también aprobada. Migración 006 aplicada a la bandeja dedicada sin reset; health público ready y pagos deshabilitados.
- Pruebas adversas: consentimiento exacto y vencimiento, cuenta inactiva/beneficiario incorrecto, precisión monetaria, timeout/503 sin replay, recuperación de huérfanos, callback temprano, firma/cifrado, correlaciones falsas, pago tardío, consulta PENDING/404/PAID, efectos duplicados y caída entre commit comercial y acuse de inbox.
- Incidencia resuelta: una ejecución anterior no pudo abrir sockets locales por permisos del entorno; tras habilitar red y corregir el cleanup del test CLI, la suite completa aprobó. No se omitieron pruebas.
- API key y secretos permanecen privados. No hubo llamadas autenticadas reales a pey. El comando pey:check-account está preparado pero no ejecutado. Faltan PEY_API_KEY_ID, PEY_BANK_ACCOUNT_ID y PEY_BENEFICIARY_NAME; helper local de captura preparado. ACTIVE/CoDi siguen reportados por el usuario.
- G4-R no aprobado: falta verificar cuenta/credenciales y acordar importe y beneficiario concretos antes del cobro. Mock/off conservados, no se creó autorización por operación. Limitaciones y hechos documentados frente a evidencia de fixtures en docs/g4-pey-integration.md. Commit local; sin publicación remota.

## Revisión de IDs y avance sin banco — 2026-11-07

Usuario solicitó buscar documentación y continuar sin Ramón. Se revisó OpenAPI: apiKeyId no es parámetro de envío; bankAccountId es opcional con cuenta vinculada. Se distingue la política conservadora del proyecto del requisito real del proveedor. Se preparó pey:check-key para GET /transaction/api-key sin IDs, con descarte de respuesta, timeout, sin redirecciones/reintentos ni mutaciones. Ocho pruebas nuevas con fixtures y typecheck aprobados. No se utilizó la clave real en red. La inspección local de bandeja fue de solo lectura, sin imprimir payloads ni PII. Continúan pendientes IDs/beneficiario o diseño explícito de verificación equivalente; no se rebajaron controles ni se iniciaron G5/frontend.

## Consulta autenticada de solo lectura — 2026-11-07

Usuario autorizó explícitamente «si dale» para una única consulta GET /transaction/api-key con la clave local. Primer arranque bloqueado por EPERM en el IPC de tsx antes de realizar HTTP; tras habilitar acceso de red, pnpm pey:check-key terminó con salida 0: accesoConfirmado=true, autenticacionRechazada=false, cobrosGenerados=0. El comando solo acepta HTTP 200 como acceso confirmado y descarta el cuerpo sin imprimir ni almacenar movimientos. No recupera apiKeyId ni bankAccountId y no demuestra cuenta ACTIVE ni capacidad de recibir CoDi. No hubo POST, cambios de configuración ni solicitudes de pago. Autorización limitada a esta lectura; prueba bancaria sigue pendiente.

## Prueba CoDi de un centavo autorizada — 2026-11-07

El usuario autorizó explícitamente una única solicitud de $0.01 MXN a su teléfono, con destino a la cuenta publicada de pruebas de Ramón, tras aclarar que no era su cuenta propia. Revisión de solo lectura en portal: la clave AgentPay Hackathon selecciona la cuenta mostrada; coincidencia local de sufijo de clave comprobada sin imprimir secretos. No se cambió la configuración del portal.

Se preparó una prueba operativa aislada de la API comercial: importe fijo de un centavo, cuenta vinculada por defecto documentada, autorización específica, registro privado 0600 creado con O_EXCL y sincronizado antes de POST, sin reintentos/redirecciones; teléfonos/claves solo se guardan como fingerprints en ese registro. No se fabricó una orden comercial ni se declararon validaciones de G4-R comercial completas. Mock/off conservados. Ocho tests nuevos aprobados y typecheck salida 0; primera verificación detectó import de zod no disponible en raíz, corregido antes de cualquier envío.

Se efectuó UN POST /codi/pn. El recibo inicial no pudo validarse y quedó SUBMISSION_UNKNOWN; no se repitió. GET /transaction/api-key posterior encontró exactamente una transacción con los identificadores únicos de esta prueba, estado PENDING, sin más páginas. Evidencia privada en work/pey-one-cent-probe, excluida del repo/ZIP. No afirmar pago, entrega de notificación al teléfono ni conciliación comercial: el usuario debe autorizar en el banco y falta confirmación autenticada de PAID. No borrar el registro de exclusión ni volver a ejecutar el POST.

## Diagnóstico de solicitud sin notificación — 2026-11-07

Usuario informa que no recibió notificación. Se ejecutó solo GET /transaction/:id para la transacción recuperada: HTTP 200, PENDING, importe de un centavo, moneda MXN, CODI/API_CODI_PN e identificadores únicos de prueba coincidentes. Teléfono configurado coincide por hash con el autorizado. A las 00:56:17 UTC la ventana local de seis minutos aún no había transcurrido. El receptor local devolvió ready; bandeja firmada sin eventos. Esto no acredita entrega ni rechazo: el evento de pago se espera después de completar el pago, no como acuse de notificación. La consulta PENDING no aporta CLABE; beneficiario no verificable todavía desde esa respuesta. No se repitió el POST, no se habilitaron pagos generales. Próximo diagnóstico: revisar CoDi dentro de la app del pagador y confirmar que el número esté registrado allí. Evidencia de consulta privada en work/pey-one-cent-probe. No se afirmará FAILED/EXPIRED a partir del tiempo local ni éxito bancario.

## Segunda solicitud CoDi autorizada — 2026-11-07

El usuario solicitó explícitamente otro cobro y confirmó el mismo celular e importe/destino propuestos (un centavo MXN hacia la cuenta pública de pruebas). GET previo de la primera transacción a las 00:59:10 UTC: PENDING, sin pago confirmado; su ventana local de seis minutos ya transcurrió. No se declaró EXPIRED a partir del tiempo local.

Se realizó un único POST nuevo con identificadores y marcador exclusivo propios, conservando intacto el primer registro. HTTP 200 y recibo transactionId/codiId validado: segunda solicitud PAYMENT_PENDING, no PAID. Sin reintentos automáticos. Respuesta original cifrada y registros privados 0600 en work/pey-one-cent-probe-2, excluidos de commits/ZIP. Teléfono y clave vinculados por hash a los autorizados; mock/off generales sin cambios. La primera transacción puede seguir mostrando PENDING: no interpretar el envío nuevo como cancelación de la anterior. No confirmar entrega de notificación al teléfono hasta que el usuario la observe ni éxito financiero hasta evidencia autenticada.

## HSBC con historial vacío — 2026-11-07

Usuario confirma HSBC habilitado, opciones de pago/cobro visibles e historial vacío. Dos GET individuales de solo lectura devolvieron HTTP 200/PENDING para ambas pruebas, con importe/metadatos y teléfono por hash coincidentes. Ambas ventanas locales transcurrieron; no se infiere EXPIRED bancario. Segundo recibo privado cifrado verificado localmente: HTTP 200, folio CoDi de 20 dígitos, transacción coincidente y sin campo error. Bandeja firmada: cero eventos. No hay evidencia de entrega al teléfono ni de PAID. No se hizo otro POST. El historial vacío no prueba ausencia de alta de CoDi y no se atribuye causalidad al banco/proveedor sin evidencia. Se revisó guía oficial HSBC (https://www.hsbc.com.mx/digital/codi/): alta de celular y selección de Cuenta origen para pagar; alternativa QR soportada, aún no solicitada ni implementada en esta entrega.

## QR diagnóstico autorizado — 2026-11-07

Usuario eligió explícitamente QR de un centavo MXN hacia la cuenta publicada de pruebas de Ramón. Se verificó en el portal que la clave mantiene seleccionada Cuenta Prueba Ramón, sin cambios. Implementado helper diagnóstico aislado scripts/pey-one-cent-qr.ts: importe fijo 0.01, expiration 900, generateImage=true, metadata identificable, registro privado O_EXCL sincronizado antes del POST y sin retries/redirecciones. No habilita el adaptador comercial QR ni frontend. Ocho pruebas nuevas y typecheck aprobados.

Un único POST /codi/qr respondió 201 y recibo id/qrString validado. Imagen PNG de pey guardada en outputs/AgentPay-QR-prueba-001-MXN.png; evidencia privada en work/pey-one-cent-qr/state.json, excluida del repo/ZIP. Estado QR_CREATED_UNPAID; no confirma pago ni termina G4-R comercial. Revisión visual del PNG realizada. No se usó amount=0 ni se enviaron nuevos push. Enviar/mostrar QR no mueve dinero: el usuario autoriza en HSBC. QR puede admitir varios pagos; solicitar una sola autorización de un centavo. Fuentes: OpenAPI oficial 2026-10-20, consultada 2026-11-07.

## Pago QR real confirmado — 2026-11-07

Usuario informa haber pagado el QR autorizado de $0.01 MXN. La bandeja dedicada contiene un codi.qr.payment_received previamente verificado por Standard Webhooks y cifrado. Se descifró localmente, verificando hash, QR IDC, metadata única de la prueba, entorno real, referencia, importe y fecha. GET /transaction/:id autenticado devuelve PAID por un centavo MXN, CODI/API_CODI_QR, con la misma transacción y metadata, sin fees/tips/applicationFee. La revisión del historial de Cuenta Prueba Ramón en el portal muestra esa misma transacción pagada por un centavo. Confirmación bancaria del diagnóstico QR, no de una orden comercial.

Se recuperó apiKeyId del webhook y se corroboró con el ID receptor API_KEY de la transacción en portal. Guardado solo en configuración privada 0600, sin mostrar el identificador ni secretos. El bankAccountId de la cuenta se obtuvo de la URL visible del portal; una consulta autenticada GET /bank-account/:id devolvió 404. No se guardó como configuración operativa, no se registró otra cuenta y no se reintentaron cobros.

Discrepancia importante: metadata.clabe coincide con la cuenta HSBC del usuario (pagador), mientras que la documentación la describe como receptora. Por eso el chequeo inicial estricto de beneficiario resultó false. No se omitió silenciosamente: se corroboró por separado el receptor mediante el historial de la cuenta de Ramón y la transacción exacta, y se retuvo evidencia privada. No concluir todavía que todos los flujos devuelven la CLABE pagadora ni eliminar controles de conciliación de Push. Pendiente aclarar con pey y agregar contrato confirmado antes de adaptar ese servicio.

El evento QR permanece en la bandeja de evidencia, no aplicado como pago de una orden ni consumiendo inventario. G4-R comercial/Push sigue pendiente: las pruebas Push anteriores no están confirmadas y el adaptador comercial QR 1:N no está implementado. No se generaron cobros nuevos durante la verificación; mock/off conservados. Evidencia privada y cifrada en work/pey-one-cent-qr; informe sanitizado en outputs. Cambio de documentación, sin modificaciones de código ni nuevas pruebas automatizadas.

## Nueva prueba Push tras pago QR — 2026-11-07

Usuario autorizó «intentemos el push» manteniendo importe de un centavo MXN, celular y cuenta de pruebas de Ramón. Revisión de solo lectura en portal confirmó Cuenta Prueba Ramón vinculada a la clave; sin cambios. Se utilizó el helper diagnóstico ya probado, con nuevo marcador exclusivo privado para esta autorización (tercer intento histórico), conservando anteriores y mock/off general.

Un único POST /codi/pn respondió HTTP 200, pero el recibo no pasó validación estricta y el marcador permanece SUBMISSION_UNKNOWN. No se repitió el envío. Consulta autenticada GET /transaction/api-key posterior encontró exactamente una transacción para los IDs nuevos en PENDING, sin páginas adicionales. Respuesta inicial cifrada y recovery privados en work/pey-one-cent-probe-3. No hay pago confirmado ni evidencia de entrega al teléfono. La respuesta tiene transactionId y codiId string de longitud 20, sin campo error; investigar discrepancia de formato frente al patrón numérico documentado antes de modificar el contrato. No confundir el pago QR confirmado previamente con este Push. Sin cambios de código productivo ni nuevas pruebas, solo diagnóstico operativo y documentación.

## Push real recibido y pagado — 2026-11-07

Usuario aportó capturas: notificación CoDi de HSBC, solicitud por un centavo MXN con beneficiario Ramón y confirmación bancaria de pago enviado (todavía en verificación en esa pantalla). No se guardaron las capturas con saldo/datos privados en git/ZIP ni se trataron como instrucciones.

Verificación independiente: GET /transaction/:id de la tercera prueba devolvió PAID, MXN, un centavo, CODI/API_CODI_PN y metadata única coincidente. Bandeja dedicada contiene codi.pn.payment_received firmado y cifrado: se verificó integridad al abrir, apiKeyId configurado, referencia, importe, orden/intento diagnóstico, transacción y fecha coincidentes con consulta. Folio del recibo upstream coincide exactamente con la captura bancaria; destinatario en la captura es Ramón y la cuenta beneficiaria tiene la terminación esperada. Sin cargos adicionales. Confirmación privada en work/pey-one-cent-probe-3/confirmation.json. No hubo otro POST durante esta verificación.

Se encontró causa del recibo inicialmente desconocido: codiId tiene 20 caracteres hexadecimales, no exclusivamente dígitos como describe la documentación. La evidencia real del proveedor coincide con el comprobante HSBC. Se ajustó solo el formato a [0-9a-fA-F]{20} en gateway y helper diagnóstico; se mantienen rechazo de otras letras, longitudes incorrectas, espacios y ausencia de folio. No cambia la autorización ni convierte aceptación en pago. No se reemplazó el registro histórico de incertidumbre ni se repitió el envío.

Verificación ejecutada tras corrección: pnpm typecheck salida 0; Vitest focalizado en gateway, helper y servicio pey: **73/73 en tres archivos**, incluidos 12 casos nuevos. Fixtures con folios ficticios, sin red bancaria. Hallazgos actualizados en capacidades/plan/validación. Las pruebas operativas QR y Push están confirmadas; no se afirma E2E comercial real ni frontend. Persiste discrepancia metadata.clabe respecto de documentación y 404 al consultar la cuenta del portal; no se retiraron controles del servicio comercial para ocultarlas. Mock/off generales conservados.

## Continuación G4 — recuperación comercial y bandeja de comercio (2026-11-07)

Autorización: «perfecto sigamos» tras proponer conectar orden, pago, conciliación y notificación. Sin nuevos cobros, credenciales reales en red, frontend, G5, alta de cuentas ni cambios de configuración privada.

Implementación: gateway findPushTransaction usa GET /transaction/api-key, metadata exacta orderId/paymentAttemptId/environment y filtros de importe/moneda/método/tipo; completa hasta cinco páginas de 80 ítems dentro de los límites del transporte. Cursores opacos escapados, ciclos/ambigüedad/página inválida/error/límite agotado bloquean recuperación. No elegir el primer resultado ni reenviar POST. PENDING solo localiza un recurso. El servicio vincula ProviderResource + intento + auditoría en una transacción, resuelve callback concurrente mismo ID y rechaza uno distinto sin reemplazar confirmación. Continúan conciliación individual y controles del beneficiario antes de liquidación comercial.

Demostración ampliada: demo:pey y nueva demo:pey:recovery. Ambas recorren API comercial local con transporte ficticio y DBs temporales, aprobación/snapshot, un único submit, webhook firmado, liquidación, reserva/inventario, outbox y consulta autenticada de notificación local del comercio. Recuperación simula recibo perdido y falta de webhook inicial; consulta, confirma y recibe callback tardío sin duplicación. Verifica stock de 10 a 8 y READY_FOR_PREPARATION, no preparación física ni entrega externa.

Verificación observada: pnpm typecheck salida 0; suite completa final **256/256 en 12 archivos** (24.98 s). 25 pruebas nuevas: 18 de descubrimiento/paginación y 7 de integración comercial/recuperación/concurrencia. pnpm demo:pey y pnpm demo:pey:recovery aprobadas con credenciales reales utilizadas 0 y cobros bancarios 0. Primera ejecución focalizada: 52 aprobadas y una fallida por URL incorrecta de notificaciones en la prueba; corregida a la ruta existente, sin omitir pruebas. Suite completa inicial 255/255; protección adicional de ID contradictorio y suite final 256/256. Demos ya aprobadas en el flujo anterior a esa protección, cuyo caso adverso y regresión normal están cubiertos por la suite final. No migraciones nuevas ni alteraciones de DBs operativas.

Documentación: AGENTS, ADR-016, guía G4, contratos API, tareas y README actualizados. Bloqueos mantenidos: cuenta de portal devuelve 404 al GET de cuenta API y metadata.clabe no coincide con receptor esperado según evidencia previa. No se afirma E2E comercial real aprobado: las pruebas bancarias fueron diagnósticas aisladas. Default mock/off conservado. Notificación es bandeja persistente local, no email/WhatsApp. No se publicaron commits a remoto.

## Ejecución G5 — interpretación y propuestas (2026-11-07)

Autorización: «guardemos estos 2 pendientes y sigamos con la siguiente etapa». PEY-001/002 guardados en docs/pey-pendientes.md y copia sanitizada de outputs. Corrección explícita: el usuario pagó desde HSBC y Ramón recibió; discrepancia de metadata no significa cuenta equivocada ni pago sin reflejarse. No se enviaron nuevos mensajes a pey ni cobros.

Implementado: IntentFragmentsSchema y grounding puro, calendario local con DST, contrato reducido de intérprete OpenAI Responses con esquema estricto y rechazo de acciones, servicio de catálogo/ofertas/propuesta sujeto a políticas, POST /v1/agent/proposals autenticado, AgentRun persistente con migración aditiva 007, replay/concurrencia/reinicio sin reejecución, configurador privado de clave/modelo y demo HTTP local. No hay frontend/G6. El modelo no puede aprobar órdenes, crear consentimientos ni solicitar pagos.

El lenguaje inicial es conservador y verificable: cantidades enteras, presupuesto MXN con formato explícito y días soportados. Datos inventados, condiciones adicionales no reconocidas, otras monedas, restricciones/horarios ambiguos, oferta ausente o sobre presupuesto no se convierten silenciosamente en compra. Alias y catálogo son datos confiables del servidor. Textos de comercio no se insertan en el prompt; salidas de herramienta y campos de autoridad se rechazan.

Comandos observados: prisma format, pnpm db:generate y pnpm typecheck aprobados. Migración 007 aplicada por pruebas/demos solo a bases temporales, incluyendo regresión de upgrade de G2; no se modificó la DB del receptor ni bases comerciales operativas. No se agregaron dependencias; lockfile sin cambios. Suite completa final **332/332 en 15 archivos**, 26.03 s (256 existentes + 76 nuevas: 40 core, 16 adaptador OpenAI, 20 integración). pnpm demo:agent aprobada: intención de 2 kg café, máximo $1,000, propuesta $850, aprobación humana pendiente, una reserva al repetir, cero llamadas reales OpenAI/banco, cero órdenes aprobadas y pagos. Regresión pnpm demo:pey:recovery aprobada con transporte ficticio.

Incidencias corregidas antes del cierre: typecheck detectó import local de dinero y estrechamiento nullable, y tipos de payload del helper de prueba Fastify; corregidos sin omitir checks. Verificación inicial focalizada 51/51; integración 18/18; tras configuración privada 72/72; suites completas 328, 331 y finalmente 332 al añadir rechazo de condiciones extra y negaciones. No se usaron credenciales reales ni llamadas a OpenAI para resolver estas incidencias.

G5 de código verificado; **validación con modelo real pendiente** (clave/modelo explícitos, acceso y prueba acotada autorizada). AGENT_PROVIDER=disabled y pagos mock/off de fábrica. Configurar una clave no activa el agente ni llama a OpenAI. Si un run queda interrumpido, exige revisión y no se reintenta automáticamente; una propuesta parcial no se aprueba sola. Límites: prototipo local de un proceso, gramática acotada, catálogo demo y sin evaluación lingüística real. No iniciar frontend ni afirmar G5 operativo real aprobado. Commit local y ZIP sin secretos; no publicación a remoto.

## Configuración privada OpenAI confirmada — 2026-11-07

Usuario indicó «listo» tras ejecutar configurador local. Se verificaron únicamente indicadores: archivo regular privado sin symlink y permisos sin acceso de grupo/otros; clave y modelo presentes; modelo coincide con el acordado y clave distinta de pey. No se imprimieron secretos ni se enviaron peticiones a OpenAI. Pagos reales continúan desactivados. Pendiente autorización concreta para una llamada de prueba acotada con datos ficticios antes de declarar G5 validado con modelo real.

## Única llamada OpenAI autorizada — 2026-11-07

Usuario autorizó «si» para una sola llamada al modelo configurado, con pedido ficticio de 2 kg de café, máximo $1,000, para mañana. Se utilizó clave privada sin imprimirla, modelo acordado y límite de 1,000 tokens de salida; store=false y herramientas vacías. Marcador exclusivo privado sincronizado antes de HTTP para impedir repetir esta autorización.

Resultado observado: **una llamada real**, HTTP **429**, error.code **credit_balance_exhausted**, error.type insufficient_quota. OpenAI no generó interpretación ni propuesta. API local devolvió 503 sanitizado; repetir la misma petición interna devolvió exactamente la misma respuesta sin una segunda llamada externa. Contadores: órdenes aprobadas 0, consentimientos 0, intentos de pago 0, llamadas bancarias 0. DB temporal con migración 007 y datos ficticios eliminada al cerrar. No se modificaron DBs operativas ni banderas generales.

Evidencia upstream cifrada y resumen privados en work/openai-live-one-request/, excluidos de Git/ZIP. No se publicó cuerpo de error, clave ni identificadores de organización. Bloqueo de G5 real identificado: saldo de API agotado; resolver en Billing de la organización correcta antes de autorizar otra prueba. No se infiere acceso/modelo plenamente validado a partir de un error de cuota. No hubo cambios de código ni nuevas pruebas automatizadas: solo prueba operativa autorizada y documentación. Fuente contrastada: guía oficial de errores OpenAI, credit_balance_exhausted identifica saldo prepago agotado y reintentar no restaura acceso.
