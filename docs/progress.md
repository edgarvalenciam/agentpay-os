# Registro de avance — AgentPay OS

**Última actualización documental:** 2026-11-07 (v1.2)

| Fase | Estado | Evidencia | Bloqueo |
|---|---|---|---|
| 0 — Pey documental (G0-D) | Documentación revisada | `docs/pey-capabilities.md`; `docs/pey-validation.md` | Sin pruebas autenticadas |
| 0 — Pey operativo (G0-R) | NO INICIADO | — | credenciales, cuenta ACTIVE, pagador y consentimiento |
| 1 — Core (G1) | APROBADO | 47 tests; typecheck sin errores | Ninguno para G1 |
| 2 — API/DB (G2) | APROBADO | 72 tests, typecheck, 3 migraciones y demo HTTP | Local, un proceso; sin pagos |
| 3 — Mock/conciliación (G3) | APROBADO | 122 tests, typecheck, demo HTTP SIMULADO | No valida integración bancaria |
| 4 — Pey real (G4) | Técnico implementado; G4-R pendiente | 195 tests; typecheck; demo contractual | IDs/nombre legal, consulta autenticada y prueba bancaria autorizada |
| 5 — OpenAI (G5) | NO INICIADA | — | — |
| 6 — Frontend (G6) | NO INICIADA | — | — |
| 7 — E2E/demo (G7) | NO INICIADA | — | — |

**El paquete original era documental. La implementación del 2026-11-07 añade core ejecutable y pruebas; la integración posterior está probada con fixtures, sin validación bancaria real.**

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
