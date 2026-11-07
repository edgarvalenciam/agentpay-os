# Arquitectura G1

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
