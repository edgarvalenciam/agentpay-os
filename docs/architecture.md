# Arquitectura AgentPay OS — evolución G1 a G7-D

Estado actual: core puro, API comercial, persistencia SQLite, orquestación mock, adaptador pey protegido, agente de propuestas y frontend local. Las secciones G1–G3 describen su alcance histórico; las extensiones siguientes indican lo implementado después. Límites actuales y revisión: docs/revision-2026-11-07.md.

Core TypeScript estricto; Zod valida entradas comerciales. `models.ts` define intención, oferta, comercio, cuenta receptora, reserva, snapshot, consentimiento y métodos. `policies.ts` evalúa reglas puras con reloj explícito y razones por check. `orders.ts` crea copias congeladas y hash SHA-256 sobre JSON canónico; el consentimiento incluye actor, orden, versión, monto, beneficiario y hash. `payments.ts` define transiciones internas e idempotencia pura. No hay I/O financiero.

## Reglas y decisiones

- MXN, centavos enteros seguros y monto positivo. Producto, categoría, unidad y cantidad deben coincidir exactamente; no se sustituyen productos ni se compran cantidades adicionales sin nueva intención.
- Oferta y reserva deben cubrir ventana de pago y margen explícitos. Cuenta ACTIVE y comercio capaz de cumplir; reserva ligada a orden, comercio y versión de oferta.
- Elegibilidad permite presentar una orden; no inicia un cobro. APPROVE y REQUEST_RECORDED exigen consentimiento y revalidación temporal. No hay función que envíe pagos.
- `tomorrowLocalDate` calcula la fecha de calendario en la zona del comprador. No inventa una hora de entrega; la intención exige deadline explícito con offset.
- QR/links son tipos previstos; METHOD_ENABLED los bloquea hasta fases posteriores. Reglas específicas impiden QR abierto y propinas en precio fijo.
- Estados de orden, pago y cumplimiento están separados. Solo pago CONFIRMED permite liberar cumplimiento. Un pago tardío puede llevar a excepción, sin devolución automática.
- El reducer de estados modela eventos de servicios confiables. PAYMENT_RECONCILED no verifica firma ni monto: esa frontera se implementa en G3/G4 y nunca debe exponerse directamente al comprador o al agente.
- Idempotencia: scope por actor/operación, clave y hash canónico del request. Mismo request devuelve operación original; distinto contenido causa conflicto. G1 no persiste, bloquea concurrencia ni garantiza exactly-once. G2 debe escribir registro y operación de forma atómica.
- SUBMISSION_UNKNOWN no puede volver a SUBMISSION_PENDING. Solo evidencia posterior puede resolverlo; ningún timeout equivale a rechazo bancario.

## Límites de integración futura

Las entradas representan hechos suministrados por un backend confiable, no afirmaciones del modelo o cliente. Al solicitar cobro se deben cargar datos actuales de cuenta, intención, reserva y oferta, comparar con snapshot y revalidar en una transacción; un snapshot no prueba disponibilidad actual. La firma comercial vincula contenido, no autentica al usuario: autenticación y persistencia son G2. No registrar snapshots con teléfonos en logs; este paquete no genera logs.

## Extensión G2

`packages/contracts` mantiene schemas de solicitudes. `packages/database` contiene Prisma, migraciones, seed y puerto UnitOfWork; core conserva independencia. `apps/api` contiene adaptador Fastify y servicio comercial que usa core y unidad de trabajo. `scripts/demo.ts` prueba HTTP real sobre loopback, DB temporal y recuperación tras reinicio. `docs/api-contracts.md` es el contrato operativo de esta fase.

El servicio serializa el flujo de idempotencia → disponibilidad → reserva/validación → persistencia de evidencia dentro de una transacción SQLite. Las consultas también usan esa unidad de trabajo para no competir con escrituras del proceso local. El servidor impide dos instancias sobre el mismo archivo con lock. No iniciar más de una Database activa sobre un archivo desde otros scripts; detener API para migrar/seed. Migrar a PostgreSQL y control transaccional apropiado antes de operación multinstancia.

Pagos, firma, conciliación y despacho de outbox no están implementados. Las tablas de intentos/recursos/transacciones/eventos existen para G3; sus fixtures de integración únicamente prueban unicidad y cardinalidad.

## Extensión G3

`core/reconciliation.ts` define puerto de envío, dinero decimal exacto y cotejo determinista de avisos. `integrations` contiene MockCodiPushGateway y firma HMAC de desarrollo, sin HTTP a proveedor. `api/payment-service.ts` admite intentos con commit antes del envío, recibe avisos crudos, confirma/conciliación y recupera UNKNOWN por ledger mock. `api/outbox.ts` entrega a bandeja local con leases, reintentos y deduplicación durable.

La transacción de confirmación registra pago/orden, reserva e inventario y crea outbox; la entrega ocurre después. Webhook y recibo concurrentes no rebajan estados confirmados. Upgrade G2→G3 preserva evidencia inmutable. Ver `g3-mock-payments.md` para contratos, permisos y límites. No hay adaptador pey ni verificador Standard Webhooks todavía.


## Extensiones G4–G6 vigentes

G4: gateway pey con prevalidación, permisos privados por orden, consulta/reconciliación y Standard Webhooks oficiales. Receptor dedicado e inbox cifrada separados de la API comercial. Liquidación e inventario/outbox atómicos; recuperación de ID por listado autenticado sin reenviar POST. Diagnósticos bancarios positivos separados del E2E comercial, que conserva PEY-001/002.

G5: IntentInterpreter extrae fragmentos; core verifica texto/fechas/catálogo y políticas. ShoppingAgentService solo lee/evalúa/proporciona propuestas. AgentRun persiste claves/resultados fuera de la llamada del modelo. No puede aprobar ni cobrar. Un caso real positivo y pruebas con fixtures; proveedor desactivado por defecto.

G6: HTML/CSS/JS y BFF Fastify por loopback, rutas/roles explícitos, sesión HttpOnly/SameSite y CSRF. Tokens privados en servidor. Perfil fixture/mock obligatorio. Preparación requiere orden pagada y cumplimiento listo, y se registra atómica/idempotentemente. Liberación de una propuesta sin aprobar y aprobación se serializan en la misma unidad de trabajo; una orden aprobada no se cancela por esta ruta.

La recuperación manual de solicitud conserva clave/cuerpo originales: primero consulta; si el intento ya existe, no hace POST. Si no aparece, el POST idempotente original puede recuperar un acuse perdido; la admisión persistente impide reenviar un intento existente/UNKNOWN. La caché financiera del navegador se descarta al arrancar. Esto sigue siendo un prototipo local de un proceso, no una arquitectura pública multicliente.


## G7-D de concurso

Explicación persistida de candidatos y checks del core, aislamiento por sesión para la demo de concurso y validación HTTP reproducible con fixtures. La UI muestra motivos y margen presupuestal sin inventar descuentos. Cookies distintas por puerto evitan que las dos demos se invaliden; cambiar sesión descarta caché de compra anterior. La evidencia y límites están en docs/g7-demo-validation.md. No cambia la autoridad financiera, no habilita proveedores reales ni producción.
