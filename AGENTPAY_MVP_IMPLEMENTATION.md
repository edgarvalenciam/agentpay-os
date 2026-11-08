# AgentPay OS — Plan maestro de implementación del MVP

**Versión:** 1.2 — inventario integral de API pey y plan de implementación (07-nov-2026)  
**Fecha:** 2026-11-07  
**Estado:** G1–G3 y G6 local verificados; G5 con fixtures y un caso real; G4 técnico y diagnósticos bancarios verificados, integración comercial real bloqueada por PEY-001/002; G7-D simulado verificado, G7-R pendiente
**Objetivo:** Construir y demostrar una compra iniciada por IA, validada por políticas deterministas y pagada mediante CoDi Push a través de pey, con confirmación financiera verificable.

> **Principio:** El agente propone; el core valida; el comprador solicita el cobro y autoriza en su banco; el proveedor financiero comunica el resultado; AgentPay concilia; el comercio cumple la orden.

## Cambios acumulados: v1.1 y v1.2

**Correcciones originales v1.1:** (1) contrato específico de CoDi Push y mapeo pesos ↔ centavos; (2) correlación `orderId` / `transactionId` / `codiId` / `numRef`; (3) firma Standard Webhooks y `webhook-id`; (4) consulta `GET /transaction/:id`, sin inventar estados de rechazo; (5) activación de cuenta CoDi de hasta cinco días hábiles; (6) reserva y vigencia comercial antes del cobro; (7) idempotencia y recuperación ante resultados inciertos; (8) roles, consentimiento y privacidad; (9) gates separados para prototipo funcional y pago real; (10) camino crítico con prioridades P0/P1/P2. Los detalles están distribuidos en las fases correspondientes.

**Fuentes principales verificadas (consultadas el 07-nov-2026):**

- [Crear CoDi Push](https://docs.pey.mx/docs/api/create-push-notification/)
- [Consultar transacción](https://docs.pey.mx/docs/api/get-transaction/)
- [Webhook de CoDi Push pagado](https://docs.pey.mx/docs/webhooks/codi/pn/)
- [Seguridad de webhooks](https://docs.pey.mx/docs/webhooks/introduction/)
- [Configurar webhooks](https://docs.pey.mx/docs/tutorials/getting-started/set-up-webhooks/)
- [Crear API key y alta de cuenta](https://docs.pey.mx/docs/tutorials/getting-started/create-an-api-key/)
- [Estatus de la cuenta bancaria](https://docs.pey.mx/en/docs/types/bank-account/)

**Importante:** que un endpoint esté documentado no demuestra que nuestra API key, cuenta receptora o banco pagador estén habilitados. Se requiere prueba real controlada. La API pública describe cómo solicitar y consultar el pago, pero **no documenta un conjunto completo de eventos de entrega/rechazo de notificaciones CoDi Push**. No inventar esos estados.

---

## Novedades v1.2 — arquitectura preparada para aprovechar pey

**Cambio de estrategia, no de gate:** implementar primero el caso vertical **CoDi Push**. Diseñar las interfaces para soportar además `CODI_QR` y `PAYMENT_LINK` en fases posteriores, sin afirmar que esos métodos están operativos ni extender el alcance de la Fase 1. **La funcionalidad adicional no debe retrasar G1**.

- Se agrega `docs/pey-capabilities.md`: inventario de **11 endpoints** de la API pública y **4 eventos** de webhook, fuentes y restricciones. Los endpoints son: dos CoDi, dos cuentas bancarias, tres links de pago y cuatro consultas de transacciones.
- Se agrega `docs/pey-adapter-contracts.md`: arquitectura de adaptadores, modelos, mapeos, conciliación, idempotencia y casos límite.
- Se agregan tareas de Fases 0–7 bajo `tasks/` y el `docs/changelog-v1.2.md` con detalle de cambios.
- Se integra `MerchantPaymentAccount` como entidad del dominio y capacidad de consultar cuentas **con estado `active`**. La configuración multi-comercio es técnicamente plausible, **no está validada contractualmente para operar con terceros**.
- Se distinguen `PaymentMethod = CODI_PUSH | CODI_QR | PAYMENT_LINK`, tipos de operaciones del proveedor y tipos de eventos. Cada método tiene características distintas: no implementar un `getStatus` genérico que presuponga que todos usan `transactionId`.
- **CoDi QR**: `POST /codi/qr` permite `amount: 0`, QR que puede asociarse a múltiples transacciones. Para órdenes de precio fijo, exigir importe > 0 y **conciliar cada transacción**, sin asumir una correspondencia 1:1 QR/orden ni usar QR abierto como mecanismo P0.
- **Payment Link**: `POST /payment-link/create` devuelve `id` y `url`, `GET /payment-link/:id` devuelve detalle/estado; `POST /payment-link/update` solo cambia el importe cuando el link está `pending`. **AgentPay nunca cambia el monto de una orden aprobada mediante ese endpoint; hay que recrear orden/consentimiento**. `hasTip` debe fijarse `false` para el escenario de importe cerrado; se reconcilian `amountBreakdown`, cargos y posibles propinas, sin equiparar bruto pagado con importe neto al comercio.
- **Transacciones**: `GET /transaction/:id` (`PENDING`/`PAID`), listados paginados por API key y por cuenta (80 elementos/página, `nextToken`) y por QR (20/página, `nextToken`). La consulta por cuenta devuelve operaciones pagadas relacionadas con el `bankAccountId` registrado.
- **Webhooks**: `codi.pn.payment_received`, `codi.qr.payment_received`, `payment_link.status_updated` y `bank.account.updated`; autenticación Standard Webhooks, deduplicación por `webhook-id`, y correlación de recursos por tipo. `bank.account.updated` solo avisa transición a `ACTIVE`, no los estados intermedios.
- **Operación**: la documentación indica que, al 07-nov-2026, no existe ambiente sandbox dedicado público y se propone probar en producción con montos pequeños. **Este paquete no efectúa pagos reales, no incluye credenciales y no autoriza pruebas financieras**.
- Se añade el **control de alcance**: Fase 1 solo modelado/tipos y políticas; Fase 3 solo simulador `CODI_PUSH`; Fase 4 integración real `CODI_PUSH` después de G0. QR y links de pago quedan como extensiones optativas tras el camino crítico, salvo autorización de cambiar prioridades.

**Lectura obligatoria adicional antes de codificar:** `docs/pey-capabilities.md` y `docs/pey-adapter-contracts.md` para evitar extrapolar campos o métodos. Documento maestro y tareas prevalecen sobre propuestas abiertas.

---

## 0. Cómo utilizar este documento

- Ejecutar las fases en orden. **Fase 0** comienza de inmediato y continúa en paralelo con **Fase 1**; completar G0 de integración real antes de Fase 4.
- Trabajar una fase por conversación o sesión de Codex. No pedir que implemente todo el producto en un solo prompt.
- Marcar las casillas `[x]` **solo** después de verificar evidencia: tests, respuesta API, logs sanitizados o captura de demo.
- Al terminar cada fase, actualizar `docs/decisions.md`, `docs/progress.md` y este checklist; dejar documentados los bloqueos.
- No dar por realizado un pago real basándose en un simulador, una respuesta de creación de cobro o un webhook no verificado.
- Dividir el trabajo en **P0 indispensable** (seguridad del pago + interpretación IA mínima), **P1 deseable** (agente enriquecido + UX integral) y **P2 opcional** (dashboard avanzado, analítica). Si falta tiempo, sacrificar P2, nunca las comprobaciones del pago ni el componente mínimo de IA del demo.
- En cada fase, mantener un comando de demo/reproducción desde terminal y una prueba automatizada. No hacer depender los gates exclusivamente de capturas visuales.

### Estado global

| Fase | Entregable | Estado | Gate |
|---|---|---|---|
| 0 | Factibilidad pey/CoDi y contratos | Documental y diagnósticos operativos verificados; alcance comercial pendiente | G0-D / G0-R |
| 1 | Dominio y motor de políticas | Completo: 47 tests y typecheck | G1 |
| 2 | API, persistencia y órdenes | Completo: API local, DB, reservas y auditoría | G2 |
| 3 | Orquestación de pagos simulada y conciliación | Completo: mock, conciliación y outbox local | G3 |
| 4 | Integración real pey/CoDi | Adaptador/conciliación con fixtures; QR y Push diagnósticos pagados; PEY-001/002 abiertos | G4 técnico; comercial real pendiente |
| 5 | Agente OpenAI | Fixtures y un caso real positivo; evaluación lingüística amplia pendiente | G5 acotado |
| 6 | Frontend comprador/comercio | Demo local fixture/mock verificada; sin claves ni cobros reales | G6 local |
| 7 | E2E, seguridad y demo | Suite, ensayo HTTP, navegador y guion verificados para demo local simulada | G7-D; G7-R comercial pendiente |

**Definición de éxito del prototipo (G7-D):** Una instrucción en lenguaje natural genera una propuesta válida; el usuario ve el detalle y solicita el cobro; el mock inicia una solicitud; el sistema valida una confirmación simulada y el comercio ve la orden pagada con distintivo inequívoco **SIMULADO**.

**Definición de éxito financiero (G7-R, adicional):** Una operación **real, de monto bajo**, se inicia mediante CoDi Push, el pagador la autoriza en su banco, pey expone la transacción como `PAID` y AgentPay verifica el evento y su conciliación. **No atribuir al comercio piloto un abono dirigido a una cuenta bancaria de pruebas de otra persona.**

---

## 1. Alcance y decisiones de producto

### Caso principal

> “Compra 2 kg de café de especialidad para la oficina, máximo $1,000 MXN, entrega mañana”.

Oferta controlada: 2 kg por $850 MXN de un comercio piloto, con disponibilidad y entrega declaradas.

### Roles

1. **Comprador:** define restricciones, revisa orden, solicita envío del cobro y autoriza en su aplicación bancaria.
2. **Agente OpenAI:** interpreta intención, consulta catálogo y propone ofertas; no tiene credenciales ni permiso para cobrar.
3. **AgentPay:** controla políticas, orden, pago, conciliación, auditoría y experiencia.
4. **Comercio:** ofrece catálogo, acepta/reserva pedido, recibe abono y prepara orden.
5. **pey:** proveedor de integración para iniciar cobro CoDi y notificar resultados, según capacidades contractuales habilitadas.
6. **Banco pagador / CoDi / SPEI / banco receptor:** notifican, autorizan, ejecutan y liquidan la transferencia según su función.

### Decisiones iniciales

- **B2B2C y API-first:** el frontend de hackathon consume la misma API que un integrador.
- **Sin custodia:** supuesto de diseño: el beneficiario final es el comercio, sujeto a validación de configuración de pey.
- **Sin pagos autónomos:** CoDi exige autorización del pagador para cada solicitud.
- **Sin doble aprobación financiera:** en AgentPay el comprador revisa y solicita el envío del cobro; en el banco autoriza el movimiento de dinero.
- **No prometer devoluciones automáticas, escrow ni protección al comprador.**
- **Catálogo controlado** y un comercio piloto para la demo.
- **Monolito modular**, no microservicios.
- **Dinero en centavos enteros** (`amountMinor`); nunca `float` para importes.
- **Estados de orden y pago separados.** Una evaluación de política `ELIGIBLE` no es todavía consentimiento de compra ni un pago.
- **Orden comercial inmutable:** la autorización para enviar CoDi queda ligada a un snapshot exacto de comercio, productos, total, moneda, entrega y teléfono de destino.
- **Reserva antes de cobrar:** el comercio debe confirmar oferta/inventario y su vigencia; en demo esta aceptación es un stub explícito y trazable.
- **Identidad y consentimiento:** usar un comprador prevalidado para demo; registrar la acción de envío de cobro, pero no confundirla con autorización bancaria.
- **Webhook y consulta verificados son la verdad financiera**, nunca el estado optimista del navegador.

### Fuera de alcance

Wallet, custodia, onboarding masivo, split payments, reembolsos automáticos, multi-procesador, logística real, mandatos recurrentes, pagos sin autorización bancaria y plataforma multi-tenant completa. La **entrega real al día siguiente** se simula como promesa comercial del proveedor controlado; si se quisiera operar comercialmente habría que capturar ubicación/datos de entrega y conectar fulfillment.

---

## 2. Experiencia objetivo: definir antes de programar el frontend

| Pantalla | Qué ve / hace la persona | Endpoint o evento que requiere |
|---|---|---|
| 1. Chat | Introduce intención, corrige restricciones | `POST /v1/intents`, `POST /v1/intents/:id/proposals` |
| 2. Ofertas | Ve proveedor, producto, precio, entrega y elegibilidad | `GET /v1/intents/:id/offers` |
| 3. Orden | Revisa snapshot y destinatario; activa **Enviar solicitud CoDi** (consentimiento comercial) | `POST /v1/orders`, `POST /v1/orders/:id/payment-requests` con `Idempotency-Key` |
| 4. Espera | Ve `PAYMENT_PENDING`, nombre del beneficiario, instrucciones para abrir banco y vencimiento real de la solicitud | `GET /v1/orders/:id` (polling para MVP) |
| 5. Resultado | Ve `PAID` solo tras conciliación; si no, pendiente/excepción | `GET /v1/orders/:id`, `GET /v1/orders/:id/events` |
| 6. Comercio | Ve órdenes pagadas y las marca en preparación | `GET /v1/merchants/:id/orders`, `POST .../:id/prepare` |
| 7. Auditoría | Ve intención, checks, orden, intentos, eventos y decisiones | `GET /v1/orders/:id/events` |

**No diseñar una pantalla bancaria propia:** la autorización ocurre en la aplicación del banco. El frontend solo instruye al usuario y muestra el estado que conoce AgentPay.

**Acciones reales del comprador:** (1) tener una cuenta/app enrolada en CoDi; (2) proporcionar teléfono asociado, con verificación de posesión para un producto real; (3) formular intención; (4) revisar la orden y solicitar notificación; (5) abrir su banco; (6) elegir cuenta si el banco lo requiere; (7) revisar **beneficiario e importe**; (8) autenticar y autorizar; (9) volver a ver estado de la orden. Si no llega la notificación, mostrar pasos de diagnóstico y una salida segura, **no generar cobros repetidos automáticamente**.

**Acciones del comercio:** (1) publicar catálogo; (2) configurar cuenta receptora CoDi habilitada; (3) aceptar/reservar oferta; (4) consultar orden pagada; (5) marcar preparación. Si el pago confirma pero la reserva vence, la orden entra a **excepción de cumplimiento**, sin intentar reversar automáticamente el SPEI.

---

## 3. Arquitectura y repositorio

**Stack propuesto:** TypeScript, pnpm workspaces, Fastify, Zod, Prisma + SQLite **local con un solo proceso**, Vitest, OpenAI API, adaptador pey, Next.js + Tailwind. Para despliegue persistente/multinstancia, migrar a PostgreSQL administrado; un archivo SQLite efímero en serverless no es seguro para conciliación.

```text
agentpay/
├── apps/
│   ├── api/src/{routes,middleware,server.ts}
│   └── web/{app,components,lib}
├── packages/
│   ├── core/{intent,catalog,policies,orders,payments,reconciliation,audit}
│   ├── contracts/{schemas,types}
│   ├── integrations/{openai,pey}
│   └── database/{prisma,repositories}
├── tests/{integration,e2e,fixtures}
├── docs/{prd.md,architecture.md,api-contracts.md,decisions.md,progress.md,pey-validation.md}
├── .env.example
└── README.md
```

### Reglas de dependencia

- `core` no importa Fastify, Next.js, OpenAI, pey ni Prisma.
- `contracts` contiene schemas compartidos; los adaptadores implementan interfaces del core.
- Las llamadas financieras se originan exclusivamente en el backend, nunca en el modelo ni en el navegador.
- El adaptador de pey tiene dos implementaciones intercambiables: `MockPaymentProvider` y `PeyPaymentProvider`.
- El proveedor mock **no debe** poder producir eventos confundibles con producción.
- `PaymentProvider` adapta valores en pesos devueltos por pey a **centavos enteros** en dominio: conversión decimal exacta con validación de dos decimales, no comparación de `float`.
- Un `PaymentAttempt` debe persistir **antes de invocar al proveedor**; ante timeout, queda `SUBMISSION_UNKNOWN`. No reenviar ciegamente un `POST` sin idempotencia del proveedor confirmada.
- El procesamiento de webhook y la transición financiera se ejecutan dentro de una transacción DB; la entrega de notificación al comercio usa **outbox** (o un job persistente) para no perderla tras un crash.

### Interfaces mínimas

```ts
interface CatalogProvider {
  findOffers(query: CatalogQuery): Promise<Offer[]>;
  reserveOffer(offerId: string, orderId: string): Promise<Reservation>;
}

interface PaymentGateway {
  readonly method: 'CODI_PUSH' | 'CODI_QR' | 'PAYMENT_LINK';
  submit(input: CreatePaymentRequest): Promise<PaymentSubmission>;
  reconcile(query: ReconciliationQuery): Promise<ReconciliationResult>;
}

interface WebhookVerifier {
  verify(rawBody: Uint8Array, headers: Record<string, string>): VerifiedPaymentEvent;
}

interface IntentInterpreter {
  parse(text: string): Promise<StructuredIntent>;
}
```

`GET /transaction/:id` permite consultar transacciones, incluidas CoDi Push; sus estados publicados son únicamente `PENDING` y `PAID`. `EXPIRED`, `FAILED`, `UNKNOWN` y `RECONCILIATION_EXCEPTION` son estados propios de AgentPay. Para QR y Links la consulta requiere identificadores y estrategias de conciliación específicas: ver `docs/pey-adapter-contracts.md`. <https://docs.pey.mx/docs/api/get-transaction/>

---

## Fase 0 — Factibilidad financiera y contratos (inmediata)

**Objetivo:** Resolver la mayor incertidumbre antes de invertir en UI.

### Checklist

- [x] Revisar la documentación pública de `POST /codi/pn`, `GET /transaction/:id`, alta de cuentas y webhooks (revisión documental, **no** integración ejecutada).
- [ ] Conseguir API key operativa, acceso al portal y habilitación específica de CoDi Push.
- [ ] Confirmar si la cuenta receptora está `active`; según pey, una cuenta nueva puede tardar hasta **5 días hábiles**. Si se utiliza la cuenta de prueba indicada por pey para una operación de centavos, documentar que el dinero se envía a esa cuenta y **no se devuelve**.
- [ ] Confirmar que el pagador tiene CoDi activo y puede recibir una solicitud al número utilizado.
- [ ] Confirmar que la cuenta que recibirá el dinero pertenece al comercio piloto, **o etiquetar explícitamente** al beneficiario como cuenta de prueba de pey; no equivale a una venta real del comercio.
- [ ] Obtener secreto de webhook (una configuración por API key) y URL pública HTTPS; preparar verificador Standard Webhooks.
- [ ] Verificar operación controlada real de **$0.01 MXN** únicamente con autorización expresa de pagador y titular receptor.
- [ ] Confirmar comportamiento efectivo de rechazo, falta de entrega, expiración y reintentos (no cubierto integralmente por el webhook de pago documentado).
- [ ] Guardar hallazgos en `docs/pey-validation.md` y ejemplos **sanitizados**.

### Contrato confirmado de pey (mapeo inicial)

| Campo/operación | Contrato publicado | Regla AgentPay |
|---|---|---|
| `POST https://api.pey.mx/codi/pn` | Bearer API key; cuerpo JSON | Exclusivamente en backend |
| `amount` | Número en **MXN**, `0 < amount <= 1000000` | Convertir desde `amountMinor` (centavos) a decimal de dos posiciones |
| `phoneNumber` | Texto numérico de **10 dígitos** | Verificar formato, posesión/enrolamiento por separado |
| `concept` | Concepto visible para el pagador | Conciso; no exponer PII |
| `expiration` | Segundos, mínimo **360**, por defecto 360 | Demo: pedir 600 segundos (10 min) y mantener reserva con margen |
| `numRef` | Texto solo dígitos, longitud **1–7** | No usar `ORD-1042` como referencia CoDi; generar referencia numérica |
| `bankAccountId` | ID pey de cuenta receptora, si se envía debe estar activa | Persistir beneficiario esperado; no confundir cuenta test con comercio |
| `metadata` | Hasta 50 pares planos de valores escalares | Incluir `orderId`, `paymentAttemptId`, `environment`; **no objetos anidados** |
| Respuesta `200` | `transactionId` (ULID pey) y `codiId` (folio de 20 dígitos) | Persistir ambos; **no equivalen a pago confirmado** |
| `GET /transaction/:id` | Estados `PENDING` y `PAID` | Consulta y recuperación cuando existe `transactionId` |
| Webhook de pago | Tipo `codi.pn.payment_received`, con `transactionId`, `amount`, `numRef`, `metadata` y `bankAccountId` **si aplica** | Verificar Standard Webhooks, reconciliar y deduplicar |
| Webhook delivery | `webhook-id`, `webhook-signature`, cuerpo crudo y secreto | Verificar firma antes de aceptar el evento; `webhook-id` para deduplicar entregas |

**Nota:** `transactionId` identifica la transacción de pey; `codiId` es el folio CoDi; `numRef` es una referencia numérica limitada; `orderId` es nuestro identificador comercial. **Nunca son intercambiables.** El campo `bankAccountId` del webhook es condicional cuando se envió al crear la solicitud; definir política de conciliación para ambos modos y fijar beneficiario esperado a través de la configuración de la API key.

**Límites de confirmación:** recibir `200` al crear una solicitud acredita que pey la aceptó para envío, **no** que el banco la entregó, el usuario la abrió o autorizó. El webhook de pago confirma una transacción reportada como pagada después de verificar firma y coincidencias. No extrapolar estados adicionales de la notificación bancaria.

### Gate G0

**G0-D (documental):** contrato y matriz **confirmado / no confirmado / no soportado**, con fuente, fecha y responsable; documentación pública revisada, sin inferir habilitación de cuenta.

**G0-R (operativo):** credenciales, cuenta receptora activa, teléfono enrolado y URL pública con secreto disponibles. Si no se cumple, continuar con mock etiquetado y registrar bloqueo; no presentar pagos simulados como reales.

**Prompt para Codex:**

```text
Actúa como arquitecto de integraciones de pagos. Revisa únicamente la documentación de pey que te entregue y produce docs/pey-validation.md: autenticación, endpoint CoDi Push, request/response, estados, webhooks, verificación de firma, idempotencia, consulta y conciliación. Distingue hechos documentados de hipótesis. No inventes campos ni endpoints. No implementes todavía el frontend.
```

---

## Fase 1 — Core de dominio y Policy Engine

**Objetivo:** Decidir correctamente qué compras pueden proponerse sin IA ni servicios externos.

### Entidades y reglas

- `PurchaseIntent`: texto original, restricciones estructuradas y versión.
- `Offer`: comercio, artículos, disponibilidad, total, moneda, entrega y vigencia.
- `PolicyEvaluation`: resultado por regla, motivos y versión de políticas.
- `Order`: snapshot inmutable de oferta aprobada y condiciones.
- Reglas obligatorias: monto máximo, moneda, categoría/producto, cantidad, fecha límite, comercio habilitado, vigencia, disponibilidad.
- Campos no conocidos: **rechazar o pedir aclaración**, nunca inferir que cumplen.
- Normalizar zonas horarias; `mañana` se resuelve con fecha local explícita del comprador y se persiste.

### Checklist

- [x] Configurar workspace TypeScript y Vitest.
- [x] Crear schemas Zod y tipos de dominio.
- [x] Implementar `evaluateOffer(intent, offer, context)` como función pura.
- [x] Implementar snapshots y hash/versionado de condiciones, incluyendo importe, comercio, artículos, entrega y teléfono destino del cobro.
- [x] Diferenciar `PolicyEvaluation.ELIGIBLE` de `Order.APPROVED` (acción explícita del comprador), y registrar `ConsentRecord` con actor, fecha, importe, beneficiario y hash de orden.
- [x] Implementar transiciones válidas de `OrderStatus`.
- [x] Probar montos, cantidad, fechas, moneda, proveedor y oferta vencida.
- [x] Probar que un cambio posterior invalida la evaluación y el consentimiento anterior.
- [x] Agregar reglas de elegibilidad para comercio `ACTIVE`, reserva válida y TTL de oferta; la ausencia de datos críticos falla de forma segura.
- [x] Documentar reglas en `docs/architecture.md`.

### Gate G1

`pnpm test` pasa; oferta de $850 elegible y oferta de $1,200 bloqueada para presupuesto de $1,000. No existe ruta desde el agente a un pago sin evaluación aprobada.

**Prompt para Codex:**

```text
Implementa SOLO la Fase 1 del documento AGENTPAY_MVP_IMPLEMENTATION.md. Usa TypeScript, Zod y Vitest. El core debe ser independiente de frameworks, proveedores financieros e IA. Implementa tipos, schemas, evaluateOffer y máquina de estados, con pruebas exhaustivas. No hagas frontend ni llamadas a pey. Al finalizar, ejecuta tests y actualiza docs/progress.md con archivos creados, comandos, resultados y bloqueos.
```

---

## Fase 2 — API, persistencia y órdenes

**Objetivo:** Exponer el core como producto API-first y persistir las transacciones.

### Modelo mínimo

- `Buyer`, `Merchant`, `Product`, `PurchaseIntent`, `Offer`, `OfferReservation`, `PolicyEvaluation`, `ConsentRecord`, `Order`, `PaymentAttempt`, `PaymentEvent`, `AuditEvent`, `IdempotencyRecord`, `OutboxEvent`.
- Claves únicas para referencias e identificadores externos, cuando existan (`providerTransactionId`, `codiId`, `webhook-id`).
- `PaymentAttempt`: `submissionStatus`, `providerTransactionId`, `codiId`, `numRef`, `beneficiaryAccountId`, `requestedPhoneLast4`, `provider`, `amountMinor`, `expiresAt`, `lastReconciledAt`; excluir teléfono completo de logs.
- `ConsentRecord`: versión/hash de la orden y aceptación comercial explícita; la aprobación bancaria solo se conoce por el pago confirmado.
- `OfferReservation`: `offerId`, `merchantId`, `orderId`, `validUntil`, `status`; evitar cobrar sobre reserva vencida.
- Índices por `orderId`, `providerRequestId`, `providerEventId`.
- Restricciones de integridad para impedir duplicados y transiciones inválidas.

### Endpoints propios (propuesta)

```http
POST /v1/intents
POST /v1/intents/{id}/proposals
GET  /v1/intents/{id}/offers
POST /v1/offers/{id}/evaluate
POST /v1/orders
GET  /v1/orders/{id}
GET  /v1/orders/{id}/events
GET  /health
```

### Checklist

- [x] Configurar Fastify, Prisma, SQLite y migraciones.
- [x] Crear repositorios e interfaces desacopladas.
- [x] Implementar reserva comercial controlada: `reserveOffer()` antes del cobro, `validUntil` persistido y liberación por vencimiento; el stub del comercio demo debe responder de forma determinista.
- [x] Implementar endpoints con validación Zod.
- [x] Implementar control básico de acceso y aislamiento comprador/comercio: un comprador no consulta órdenes ajenas y un comercio solo ve las propias; autenticar incluso si demo usa usuarios seed.
- [x] Para demo, fijar por configuración los usuarios y teléfonos preenrolados. En producto real exigir verificación de posesión del teléfono, consentimiento y medidas anti-spam (rate limiting).
- [x] Implementar `Idempotency-Key` por actor/ruta/cuerpo en creación de intención/propuesta/orden; mismo payload = mismo resultado, payload distinto = `409`. Ruta de cobro pendiente de G3, usa esta misma infraestructura.
- [x] Persistir auditoría de decisiones, consentimiento comercial, reserva, transiciones y eventos outbox.
- [x] Agregar seed reproducible de comercio, productos y ofertas.
- [x] Crear colección HTTP o scripts de ejemplo.
- [x] Probar reinicio de API y recuperación del estado.

### Gate G2

Desde terminal se crea intención, evalúa oferta, crea orden y recupera auditoría sin interfaz gráfica. Un replay idempotente devuelve la misma operación y un payload distinto con la misma clave produce conflicto.

**Prompt para Codex:**

```text
Implementa SOLO Fase 2. Expón el core existente por Fastify, agrega Prisma+SQLite, migraciones, seeds, validación, control de acceso mínimo, idempotencia y audit trail. No modifiques las reglas de negocio para adaptarlas a HTTP. Incluye pruebas de integración y ejemplos curl. Ejecuta migraciones/tests y documenta resultados en docs/progress.md.
```

---

## Fase 3 — Orquestación de pagos simulada y conciliación

**Objetivo:** Demostrar la integridad del ciclo financiero antes de depender de pey.

### Separación de estados

**Evaluación de oferta:** `UNASSESSED → ELIGIBLE | REJECTED`.

**Orden:** `DRAFT → AWAITING_BUYER_CONFIRMATION → APPROVED → PAYMENT_PENDING → PAID → FULFILLMENT_PENDING → COMPLETED`. `APPROVED` significa **solicitud comercial de envío de cobro**, no autorización financiera; en el MVP puede ser transición atómica al crear la solicitud previa revalidación.

**Pago (interno):** `CREATED → SUBMISSION_PENDING → PENDING → CONFIRMED`, con caminos `SUBMISSION_UNKNOWN`, `RECONCILIATION_REQUIRED` y `REJECTED_LOCALLY`. **No afirmar** que `FAILED` o `EXPIRED` provienen de pey: su API de consulta documenta `PENDING | PAID` para una transacción.

**Cumplimiento:** `RESERVED → READY_FOR_PREPARATION → PREPARING → COMPLETED`, o `FULFILLMENT_EXCEPTION` tras pago si caducó la reserva. Una reserva no puede vencer antes de la expiración definida para CoDi más un margen operativo acordado; si no hay garantía de reserva, no simular una promesa comercial firme.

No marcar como `FAILED` o `EXPIRED` una solicitud solo por timeout local si puede existir pago tardío. `SUBMISSION_UNKNOWN` o `RECONCILIATION_REQUIRED` requiere consulta posterior o revisión manual. Si no hay confirmación, no permitir reintento automático que pueda duplicar un cargo.

**Transacción crítica de envío:** persistir intento y `Idempotency-Key` → bloquear intento activo por orden → enviar a proveedor → guardar `transactionId` y `codiId`; ante timeout intermedio, conservar `SUBMISSION_UNKNOWN` y conciliar por metadata/referencia, sin reintentar `POST` a ciegas. **Exactly-once externo no está garantizado** si el proveedor no acepta una clave de idempotencia documentada.

### Endpoints

```http
POST /v1/orders/{id}/payment-requests
GET  /v1/orders/{id}/payments
POST /v1/test-only/mock-payments/{id}/confirm
POST /v1/test-only/mock-payments/{id}/reject
```

Los endpoints `test-only` solo existen en entorno de desarrollo/test; prohibidos en producción.

### Checklist

- [x] Implementar interfaz `PaymentProvider`.
- [x] Implementar `MockPaymentProvider` y respuestas realistas, sin fingir ser pey; cada evento debe estar marcado `environment=mock`.
- [x] Garantizar un único intento activo por orden, lock/índice único y claves idempotentes por actor/ruta/cuerpo.
- [x] Introducir `PAYMENT_PROVIDER=mock|pey` y `ALLOW_REAL_PAYMENTS=false` por defecto; la activación de pagos reales requiere configuración deliberada del servidor.
- [x] Guardar intento antes de llamar al proveedor; diseñar recuperación ante timeout de envío y reinicio del proceso; usar `SUBMISSION_UNKNOWN`.
- [x] Proteger contra creación de cobro si oferta o reserva ya venció; registrar consentimiento comercial sobre snapshot exacto.
- [x] Implementar recepción de evento, validación, deduplicación (`webhook-id` cuando exista) y conciliación, con el cuerpo raw disponible para firma.
- [x] Usar una tabla outbox para notificación al comercio, con procesamiento idempotente/reintentos; DB y envío externo no son una única transacción.
- [x] Confirmar coincidencia de monto, moneda, `transactionId`, `numRef`, metadata `orderId`, beneficiario esperado e intento. Tratar `bankAccountId` opcional según cómo fue configurada la solicitud.
- [x] Normalizar MXN decimal a centavos usando conversión segura y rechazar importes con precisión inválida.
- [x] Persistir evento y transición en una transacción atómica.
- [x] Gestionar webhooks repetidos, fuera de orden, tardíos y con importes incorrectos.
- [x] Notificar al comercio únicamente después de confirmación válida.
- [x] Registrar eventos de auditoría sin secretos ni PII innecesaria.

### Gate G3

Flujo completo desde API: `order → payment request → pending → mock confirmed → paid → merchant order`. Duplicados y webhooks maliciosos no provocan efectos financieros ni comerciales adicionales; pérdida de respuesta de `POST` deja `SUBMISSION_UNKNOWN` sin duplicar el envío.

**Prompt para Codex:**

```text
Implementa SOLO Fase 3 con un proveedor mock explícito. Prioriza integridad transaccional, idempotencia, deduplicación, conciliación y manejo de estados UNKNOWN. No marques PAID desde el frontend ni por simple éxito HTTP al crear solicitud. Escribe tests para doble clic, webhook duplicado, importe incorrecto, confirmación tardía y timeout. Actualiza docs/progress.md.
```

---

## Fase 4 — Adaptador real pey / CoDi Push

**Objetivo:** Sustituir el mock por una integración verificable, sin alterar el dominio.

### Checklist

- [ ] Implementar `PeyPaymentProvider` conforme a `POST /codi/pn` documentado: `Authorization: Bearer`, `phoneNumber`, `amount` (pesos), `numRef` (máximo 7 dígitos), `concept`, `expiration >= 360`, `bankAccountId` cuando corresponda y `metadata` plana.
- [ ] Cargar claves y secreto de webhook desde variables de entorno; nunca en navegador ni git. Mantener una URL de webhook por API key, como documenta pey.
- [ ] Usar `amountMinor` interno y serialización segura a MXN de dos decimales; verificar que ambos lados concilian.
- [ ] Generar `numRef` numérico con unicidad en la ventana activa y `metadata.orderId` / `metadata.paymentAttemptId` con valores escalares; no incluir información sensible.
- [ ] Persistir la respuesta `200`: `transactionId` (ULID) y `codiId` (folio CoDi); el `200` **no es pago**.
- [ ] Implementar `GET /transaction/:id` para recuperar únicamente estados publicados `PENDING` / `PAID`. Un `404` no significa necesariamente rechazo bancario.
- [ ] Exponer `POST /v1/webhooks/pey`; verificar Standard Webhooks **contra raw body**, encabezados firmados y secreto, con SDK oficial o implementación validada. Usar `webhook-id` para deduplicación.
- [ ] Procesar exclusivamente `codi.pn.payment_received` como evento de pago, sin inventar eventos de rechazo o expiración; mapear importe, `transactionId`, `numRef` y metadata externa.
- [ ] Verificar `apiKeyId`, importe, intento, beneficiario y método/`payableType` cuando se consulta el recurso, con `bankAccountId` condicional. Resolver inconsistencias en `RECONCILIATION_REQUIRED`.
- [ ] Probar errores 400/500/503, timeout, reintentos seguros, webhook fuera de orden y respuesta no recibida.
- [ ] Confirmar beneficiario: cuenta del comercio `active`, o cuenta de prueba de pey explícitamente identificada; **no afirmar que fondos de prueba llegaron a comercio**.
- [ ] Ejecutar $0.01 MXN real solo con autorización de participantes; registrar tipo de cuenta receptora y evidencia sanitizada.
- [ ] Implementar recuperación por consulta al `transactionId` cuando exista; si no existe por timeout de creación, mantener estado incierto y resolución asistida.
- [ ] Conciliar confirmación con importe, referencia y orden; guardar evidencia sanitizada.

### Gate G4

**G4-R real:** operación de monto bajo confirmada por webhook firmado y/o consulta `PAID` verificable, con `transactionId` conciliado, especificando la cuenta receptora real. **G4-D alternativo:** mock demostrado y bloqueo documentado. **No** afirmar que G4-R está completo cuando solo se ejecutó G4-D.

**Prompt para Codex:**

```text
Lee docs/pey-validation.md y la Fase 4. Implementa el adaptador pey únicamente con campos y endpoints verificados. No adivines firmas, headers, estados ni esquemas. Mantén el mock para tests y una bandera explícita PAYMENT_PROVIDER=mock|pey. Prueba normalización, autenticidad de webhook, errores, reintentos y conciliación. No hagas cambios de frontend.
```

---

## Fase 5 — Agente OpenAI y herramientas

**Objetivo:** Incorporar interpretación y selección inteligente sin conceder privilegios financieros al modelo.

### Herramientas permitidas

- `search_catalog`
- `get_offer_details`
- `propose_order`
- `evaluate_offer`

**Prohibidas al modelo:** crear pagos directamente, marcar pagos confirmados, modificar el presupuesto aprobado, editar auditoría, saltarse reglas.

### Checklist

- [x] Implementar `IntentInterpreter` con salida estructurada y validación Zod.
- [x] Capacidades internas restringidas del orquestador y extracción con esquema estricto; el modelo no recibe function tools (ADR-017).
- [x] Limitar ofertas a resultados del catálogo; nunca inventar proveedor, precio o stock.
- [x] Pedir aclaración si falta una restricción esencial.
- [x] Manejar instrucciones maliciosas dentro de descripciones de productos.
- [x] Confirmar que la selección propuesta siempre pasa por Policy Engine.
- [x] Probar instrucciones ambiguas, cambios de presupuesto y ofertas incompatibles.
- [ ] Registrar versión de modelo, versión de prompt y decisión de política sin almacenar secretos.
- [ ] Añadir prueba de **cambio de intención**: el agente propone una oferta válida, pero si comprador cambia presupuesto/producto antes de pagar, invalidar snapshot y exigir nueva autorización comercial.
- [x] No introducir dependencia obligatoria de OpenAI en la ejecución y conciliación: si el modelo falla, las órdenes pagadas siguen reconciliándose.

### Gate G5

Una instrucción natural produce una propuesta estructurada; el core la aprueba o rechaza correctamente. Un prompt injection en el catálogo no puede crear ni confirmar pagos.

**Prompt para Codex:**

```text
Implementa SOLO Fase 5. Usa OpenAI para interpretar intención y consultar el catálogo mediante herramientas restringidas. El modelo no debe llamar al proveedor de pagos ni cambiar políticas. Valida toda salida estructurada con Zod y conserva el core como fuente de verdad. Incluye pruebas de ambigüedad, oferta inventada y prompt injection. Documenta el flujo.
```

---

## Fase 6 — Frontend comprador y comercio

**Objetivo:** Construir la experiencia ya definida, usando exclusivamente la API.

### Checklist

- [x] Diseño responsivo HTML/CSS/JS con BFF Fastify, alternativa local implementada según ADR-019; sin Next.js/Tailwind.
- [x] Pantalla 1: chat e intención.
- [x] Pantalla 2: oferta, condiciones y resultado de políticas.
- [x] Pantalla 3: resumen inmutable y acción “Enviar solicitud CoDi”.
- [x] Pantalla 4: espera simulada con instrucciones y estado consultado al backend; sin espera bancaria real desde UI.
- [x] Pantalla 5: confirmación, pendiente, error o excepción; nunca éxito optimista.
- [x] Pantalla 6: órdenes del comercio y acción “Preparar”.
- [x] Pantalla 7: auditoría técnica simplificada para demo.
- [x] Distintivo **SIMULADO** visible; BFF rechaza todo perfil real/no fixture y producción, sin interruptor de activación.
- [x] Mostrar beneficiario del snapshot de demo. Beneficiario bancario real queda fuera del perfil G6 y bloqueado por PEY-001/002.
- [ ] Mostrar errores separados: notificación posiblemente no recibida, pago no confirmado, problema de conciliación y excepción de cumplimiento.
- [ ] Mantener TTL de la solicitud CoDi real; el reloj del cliente es informativo, nunca la fuente de verdad.
- [x] Manejar loading, doble clic, errores, reintentos seguros y recarga de página.
- [x] No almacenar credenciales de pey ni exponer datos sensibles.

### Gate G6

Una persona puede completar el recorrido desde el navegador; recargar la página no altera el estado; la confirmación visual depende exclusivamente del backend.

**Prompt para Codex:**

```text
Implementa SOLO Fase 6. Construye las pantallas definidas en la sección 2, con Next.js/Tailwind, consumiendo contratos API existentes. No dupliques reglas de negocio en React. El botón de cobro debe ser idempotente y la pantalla de éxito debe depender del estado verificado por el servidor. Distingue visiblemente pagos simulados de reales. Prioriza claridad, accesibilidad y demo móvil.
```

---

## Fase 7 — End-to-end, endurecimiento y presentación

### Matriz mínima de pruebas

| Caso | Resultado esperado |
|---|---|
| Oferta $850 dentro de $1,000 | Elegible |
| Oferta $1,200 | Rechazada; sin cobro |
| Entrega después de fecha límite | Rechazada |
| Cambio de precio después de evaluar | Revalidación obligatoria |
| Doble clic en “Enviar solicitud” | Un solo intento efectivo |
| Timeout al enviar a pey | Estado indeterminado; sin reintento ciego |
| Webhook repetido | Una sola transición y notificación |
| Webhook con importe distinto | Excepción; no `PAID` |
| Webhook sin autenticidad válida | Rechazado |
| Webhook tardío | Conciliación, no descarte silencioso |
| Recarga del navegador | Estado persistente correcto |
| Usuario no autoriza en banco | No marcar FAILED por silencio; consultar transacción y conservar pendiente/excepción según política |
| Comercio prepara antes de pago | Acción bloqueada |
| `200` de creación de CoDi Push sin pago | `PENDING`, nunca `PAID` |
| Metadata de pey con `orderId` incorrecto | Excepción; no confirmar orden |
| Caducó reserva antes del pago | Bloquear nuevo cobro; pago tardío pasa a excepción de cumplimiento |
| Pago a cuenta de pruebas de tercero | Etiqueta de cuenta de pruebas; no afirmar que el comercio cobró |
| Duplicado de webhook con distinto `webhook-id` pero mismo `transactionId` | Una sola confirmación comercial |
| Firma válida pero recurso corresponde a otra API key / importe | Rechazo o excepción, sin `PAID` |
| Crash después de persistir `PAID` y antes de avisar al comercio | Entrega posterior con outbox, sin evento comercial perdido |
| Catálogo con prompt injection | No altera permisos ni políticas |

### Checklist

- [x] Ejecutar suite unit + integration + E2E.
- [x] Verificar variables de entorno y ausencia de secretos en git.
- [x] Validar manejo de datos personales y minimización de teléfono.
- [x] Preparar seed reproducible y reset de demo sin borrar evidencia real.
- [x] Ensayar flujo positivo y rechazo por política.
- [x] Ensayar plan B simulado, identificado explícitamente.
- [x] Preparar demo de 3 minutos y narrativa de diferenciación.
- [x] Mostrar auditoría y conciliación como valor diferencial.
- [x] Documentar límites reales: autorización bancaria obligatoria, dependencia CoDi y sin garantía de entrega.

### Gate G7 — Definition of Done

- **G7-D (demo):** flujo completo simulado, con etiqueta visible, tests críticos y explicación de autorización bancaria.
- **G7-R (pago real):** además, evidencia de `GET /transaction/:id` en `PAID` o webhook firmado conciliado con pago real controlado; claridad sobre la cuenta beneficiaria. La demo real no requiere físicamente entregar el producto.
- En ambas modalidades, el cliente no puede falsificar `PAID`, los estados sobreviven a reinicio y el equipo explica quién autoriza, quién mueve el dinero y cómo se confirma la transacción.

---

## 4. Secuencia de demo recomendada (3 minutos)

1. **00:00–00:25 — Problema:** “Los agentes pueden decidir qué comprar, pero necesitan controles verificables y un mecanismo local de pago”.
2. **00:25–01:00 — Intención:** escribir la instrucción de 2 kg de café, $1,000 máximo.
3. **01:00–01:30 — Inteligencia + política:** mostrar oferta de $850 y un intento de $1,200 bloqueado.
4. **01:30–02:15 — CoDi:** mostrar resumen, solicitar cobro, abrir banco y autorizar si hay integración real disponible.
5. **02:15–02:40 — Confirmación:** webhook verificado, orden pagada y vista del comercio.
6. **02:40–03:00 — Diferenciación:** evidencia de intención, reglas, autorización y conciliación en un solo registro.

**Nunca representar un mock como una operación bancaria real.**

---

## 5. Camino crítico y prioridades para el hackathon

| Prioridad | Imprescindible | Se puede posponer |
|---|---|---|
| **P0** | Policy Engine, snapshot/consentimiento, pedido/reserva, idempotencia, cobro, webhook, conciliación, API, **interpretación OpenAI mínima** y checkout demostrable | Ninguno de estos componentes del flujo prometido |
| **P1** | Herramientas avanzadas del agente, comparación de múltiples ofertas y UX completa | Búsqueda inteligente compleja y diseño visual avanzado |
| **P2** | Panel de comercio completo, filtros, historial avanzado, reportes y mejoras estéticas | Todo si el tiempo o la integración financiera se bloquean |

**Secuencia ajustada:**

1. **De inmediato:** alta de cuenta/credenciales pey + webhooks públicos + teléfono enrolado; el proceso de alta bancaria puede exceder el hackathon.
2. **En paralelo:** Fase 1 y Fase 2 para disponer de core y API con pruebas.
3. **Luego:** Fase 3, con mock de pagos y conciliación de extremo a extremo; ya existe un producto demostrable sin banco.
4. **Tan pronto G0-R lo permita:** Fase 4 de integración real y prueba de $0.01; no retrasarla por front o IA.
5. **Después:** completar Fase 5 (OpenAI) y el checkout mínimo de Fase 6; aunque se implementen al final, **ambos son obligatorios para presentar la promesa de compra agéntica**. Portal completo de comercio solo si queda capacidad.
6. **Final:** Fase 7 con dos rutas de demo: real verificable y mock visible.

**Mínimo defendible si pey no habilita la cuenta:** core + agente OpenAI real + checkout mínimo + simulador transparente + documentación técnica demostrando dónde se conecta el banco. No presentar el simulador como una integración real terminada.

## 6. Riesgos y decisiones pendientes

| ID | Riesgo / decisión | Acción |
|---|---|---|
| D-01 | ¿pey tiene CoDi Push habilitado para esta cuenta? | Confirmar en Fase 0 |
| D-02 | ¿Cuál es el contrato de webhook y su firma? | Confirmar en Fase 0 |
| D-03 | ¿Podemos consultar pagos pendientes? | Confirmar en Fase 0 |
| D-04 | ¿La cuenta receptora pertenece al comercio? | Confirmar antes de pago real |
| D-05 | ¿Cómo se reserva inventario? | Implementación controlada del comercio demo |
| D-06 | ¿Cómo se verifica titularidad del teléfono? | Para MVP, pagador pre-enrolado; no afirmar verificación |
| D-07 | ¿Qué sucede ante pago tardío y reserva vencida? | Estado de excepción y conciliación manual |
| D-08 | ¿Qué ocurre si el comercio no entrega? | Proceso manual fuera de MVP |
| D-09 | ¿Cómo se autentica a comprador y comercio? | Auth mínimo en MVP, endurecer antes de producción |
| D-10 | ¿Qué diferencia el producto frente a proveedores existentes? | Demostrar Intent Assurance y trazabilidad; validar mercado después |
| D-11 | ¿Qué pasa si el `POST /codi/pn` se envía, pero perdemos su respuesta? | Estado `SUBMISSION_UNKNOWN`; no reenviar a ciegas |
| D-12 | ¿Cómo enlazamos identificadores? | `orderId`, `paymentAttemptId`, `transactionId`, `codiId`, `numRef` y `webhook-id`, cada uno con semántica distinta |
| D-13 | ¿Cuenta del comercio o cuenta de pruebas de pey? | Declarar el beneficiario real en pantalla y demo |
| D-14 | ¿Qué precisión tienen los estados de pey? | `GET /transaction/:id`: `PENDING`/`PAID`; los demás son internos |
| D-15 | ¿Cuál es la vigencia de la reserva? | Debe cubrir CoDi TTL más margen, o pasar a excepción de cumplimiento |
| D-16 | ¿Qué pruebas exigen credenciales reales? | Separar claramente gates documentales, simulados y financieros |

---

## 7. Ritmo de trabajo con Codex

Al comenzar cada fase, usar este encabezado antes del prompt específico:

```text
Estamos desarrollando AgentPay OS. Lee primero AGENTPAY_MVP_IMPLEMENTATION.md, docs/architecture.md, docs/decisions.md y docs/progress.md (si existen). Implementa exclusivamente la fase indicada. Antes de modificar código, resume el plan y los archivos afectados. No inventes contratos de pey. No cambies decisiones de dominio sin explicarlas. Al terminar, ejecuta lint, typecheck y tests relevantes, muestra resultados, documenta riesgos y actualiza docs/progress.md. Si falta información crítica, detente y pregunta.
```

### Plantilla de cierre de fase

```markdown
## Fase N — Resultado
- Estado: COMPLETA / PARCIAL / BLOQUEADA
- Commit / referencia:
- Archivos modificados:
- Endpoints o interfaces entregadas:
- Pruebas ejecutadas y resultado:
- Evidencia del gate:
- Riesgos pendientes:
- Decisiones nuevas:
- Próxima fase recomendada:
```

### Regla de control de cambios

Si durante una fase surge un cambio de arquitectura o alcance, registrar en `docs/decisions.md`:

```markdown
## ADR-NNN — Título
- Fecha:
- Contexto:
- Opciones consideradas:
- Decisión:
- Consecuencias:
- Impacto en PRD y roadmap:
```

---

## 8. Próxima acción inmediata

1. Crear repositorio y agregar este archivo en la raíz.
2. Crear `docs/pey-validation.md` con la tabla de contrato verificado de Fase 0; luego anotar **credenciales y habilitaciones pendientes** (sin incluir secretos).
3. Iniciar alta de cuenta/llaves y webhook cuanto antes; **en paralelo iniciar Fase 1** con el prompt correspondiente. Probar $0.01 solo después de consentimiento y habilitación.
4. No comenzar el frontend hasta que los gates G1–G3 estén aprobados; si el tiempo aprieta, implementar solo el checkout P1 y posponer el panel de comercio P2.

**Criterio de arquitectura:** el core debe ser vendible como infraestructura independiente del agente y del medio de pago; OpenAI y pey son adaptadores, no la fuente de verdad comercial ni financiera.


---

## 9. Definition of Ready para comenzar cada sprint

- **Core:** PRD leído, oferta de ejemplo y reglas de negocio concretas; no se requieren credenciales.
- **API:** G1 con pruebas verdes, contrato OpenAPI/Zod y migraciones planificadas.
- **Mock de pagos:** G2, identificadores definidos y máquina de estados cerrada.
- **Pey real:** documentación verificada + `PEY_API_KEY`, `PEY_WEBHOOK_SECRET`, cuenta activa o de prueba, pagador enrolado y webhook HTTPS público. **Ningún secreto en el chat/repo.**
- **OpenAI:** G3, herramientas acotadas, output JSON validable y API key en servidor.
- **Frontend:** endpoints con ejemplos, estados de error y respuesta idempotente documentados.
- **Demo:** script reproducible, seed, banco/app listos cuando corresponda, plan alterno mock, **una llamada genuina a OpenAI en el flujo principal**, y evidencia sanitizada.

## 10. Ejemplo de request pey (documentado, NO ejecutado)

```json
{
  "amount": 850,
  "phoneNumber": "5512345678",
  "concept": "Compra cafe pedido 1042",
  "expiration": 600,
  "numRef": "1042",
  "bankAccountId": "<ULID_DE_CUENTA_ACTIVA>",
  "metadata": {
    "orderId": "ORD-1042",
    "paymentAttemptId": "PAY-1042",
    "environment": "real"
  }
}
```

- Los valores de teléfono y `bankAccountId` son ejemplos; **no corresponden a cuentas configuradas**.
- El ejemplo asume cuenta `bankAccountId` activa. Si se omite, pey envía el cobro a la cuenta CoDi ligada a la API key; verificar ese beneficiario.
- `metadata` es **plana**, no objetos anidados; `numRef` es texto numérico y no lleva el prefijo `ORD-`.
- `amount: 850` equivale a `85000` centavos internos; no transformar dos veces.
- Una respuesta con `transactionId` y `codiId` se guarda como solicitud enviada, no como pago.
- La consulta debe usar `GET /transaction/{transactionId}`; la notificación bancaria requiere autorización manual del comprador.


---

## 11. Apéndice v1.2 — qué construir y en qué orden

**Fase 1 (G1):** tipos `PaymentMethod`, `PaymentIntent`, `MerchantPaymentAccount`, `OrderSnapshot` y evaluador de políticas **sin implementaciones de proveedores**. No exponer funciones que cobren en `packages/core`.

**Fase 2 (G2):** modelos persistentes y repositorios para cuentas receptoras, métodos, `PaymentAttempt`, `ProviderResource` (tipo + ID), `PaymentEvent`, estados y outbox. Las referencias externas se guardan por tipo: `transactionId` para CoDi Push, `codiQrId`/ID QR para QR y `paymentLinkId` para link. Un recurso puede tener múltiples transacciones; ninguna referencia corta `numRef` sustituye el ID único de orden.

**Fase 3 (G3):** implementar en el mock solo CoDi Push por defecto. Crear escenarios de timeout después de envío, webhook repetido, confirmación tardía, webhook con monto distinto y transacción sin referencia. No generar doble solicitud si el primer `POST` tiene resultado desconocido. Idempotencia de AgentPay no garantiza idempotencia de la API de pey; confirmar con proveedor antes de reintentar el alta financiera.

**Fase 4 (G4):** integrar CoDi Push real bajo configuración `PAYMENT_PROVIDER=pey` **y** permiso explícito de prueba, con firma Standard Webhooks, raw body, reconciliación contra `GET /transaction/:id` y eventos de auditoría. Dejar el adaptador QR/Link como `NOT_IMPLEMENTED` claramente tipado si aún no se construye. **No publicar un switch de UI hacia opciones incompletas**.

**Extensión 4A (opcional):** registro de cuenta (`POST /bank-account`) y polling de `GET /bank-account/:id`; webhook de activación. Requiere validar titularidad, permisos de acceso y alcance comercial antes de habilitar onboarding a terceros.

**Extensión 4B (opcional):** CoDi QR con importe cerrado (no importe abierto para órdenes); `generateImage=false` por latencia y render de `qrString`, o imagen opcional. Reconciliar transacciones mediante QR ID y API de consulta, teniendo en cuenta pagos múltiples.

**Extensión 4C (opcional):** Payment Links con `hasTip=false`, redirecciones HTTPS y `clientReferenceId` para correlación. La redirección visual NO confirma pago: webhook firmado y/o consulta posterior. Actualización de importe en link solo para flujos comerciales con **nueva orden/nuevo consentimiento**.

**Fase 5–7:** conectar OpenAI y frontend después de validar core y pagos. Presentar CoDi Push como principal; no degradar seguridad del camino de pago para exhibir más funcionalidades.

**Decisión de producto:** AgentPay = *intención + gobierno de políticas + orquestación + evidencia financiera*. pey = proveedor de cobro. El valor de AgentPay no es replicar la API de pey, sino asegurar la coherencia entre intención, orden aprobada, beneficiario, pago y cumplimiento.

**Límites no documentados públicamente:** payouts, transferencias salientes, reembolsos automáticos, escrow, split de fondos, cobros autónomos CoDi y una API documentada de estados de notificación bancaria entrega/rechazo. No inventar estas funciones.

**Verificación pendiente con pey:** operación para terceros/multi-comercio bajo una API key; titularidad y obligaciones de las cuentas; reintentos/idempotencia de `POST`; gestión de expirados; propinas/comisiones y reversos en Links; campos exactos de respuestas susceptibles a cambios; habilitación bancaria y comportamiento en pago tardío.

## Cierre G1 — 2026-11-07

Core implementado y verificado sin proveedores, HTTP, DB ni frontend. Ver evidencia en `docs/progress.md`. Los estados internos de pagos no son estados publicados por pey. G2 y G3 siguen pendientes: no hay garantías persistentes de idempotencia o conciliación operativa.

Correcciones a la revisión original v1.2: `GET /payment-link/{id}` incluye `partial`; el webhook de link publica solo `pending/processing/paid`. Los metadatos del recurso se devuelven bajo `metadata.externalMetadata` en las transacciones; los de un link consultado son un mapa directo. Ver `docs/pey-review-2026-11-07.md`.

## Cierre G2 — 2026-11-07

API local y SQLite/Prisma implementados. 72 pruebas aprobadas (47 core + 25 integración); migraciones y demo HTTP con reinicio verificadas. Auth local por actor, reserva transaccional, aprobación ligada al hash y auditoría/outbox persistentes. No se envían cobros ni notificaciones al comercio. Ver `docs/progress.md` y `docs/api-contracts.md` para evidencias y límites. G3 no iniciado.

## Cierre G3 — 2026-11-07

Gateway CODI_PUSH simulado, solicitud persistida antes del envío, UNKNOWN sin reintento, webhook HMAC de desarrollo separado de pey, conciliación y outbox/bandeja local implementados. 122 pruebas, typecheck y demo HTTP de pago simulado aprobados. No hay frontend, credenciales reales ni operaciones bancarias. La firma oficial Standard Webhooks sigue en G4; ver `docs/g3-mock-payments.md`.

## Preparación de URL G4 — 2026-11-07

Receptor dedicado y túnel HTTPS temporal preparados por solicitud del usuario. Verificador oficial Standard Webhooks, inbox cifrada y pruebas implementados; 137 tests aprobados. Falta secreto del portal, transporte/conciliación pey y prueba financiera. G4-R no aprobado. Ningún cobro realizado. Guía: docs/pey-webhook-url.md.

## Implementación técnica G4 — 2026-11-07

Adaptador CoDi Push protegido, consulta de cuenta/transacción, procesador de webhook cifrado y conciliación implementados. 195 pruebas y typecheck aprobados; demo contractual sin banco. G4-R permanece pendiente: faltan IDs/nombre legal, validación autenticada y acuerdo concreto de monto/beneficiario. No se realizaron llamadas autenticadas reales ni cobros. Ver docs/g4-pey-integration.md.

## Evidencia real posterior: QR pagado — 2026-11-07

Un centavo MXN pagado desde HSBC, con API PAID, evento Standard Webhooks válido y transacción coincidente en historial receptor de Ramón. apiKeyId recuperado de forma privada. Se mantiene pendiente G4-R comercial/Push, consulta de cuenta compatible con API (404 en cuenta del portal) y aclaración de metadata.clabe, que en esta prueba coincide con pagador y no con receptor documentado. No se incorporó todavía el adaptador QR comercial ni frontend.

## Evidencia real posterior: Push pagado — 2026-11-07

También se confirmó la prueba diagnóstica CoDi Push de un centavo mediante API PAID, webhook firmado y capturas HSBC con beneficiario/folio coincidentes. El transporte bancario QR/Push y la recepción real de webhooks tienen evidencia. Resta integrar el E2E comercial real, resolver compatibilidad de cuenta portal/API y discrepancia metadata.clabe. Corregido formato de codiId con evidencia bancaria: 20 caracteres hexadecimales; 73 regresiones focalizadas y typecheck aprobados. No hay frontend ni habilitación general de pagos.

## Flujo comercial con recuperación verificado — 2026-11-07

Se incorporó descubrimiento paginado autenticado para recuperar transactionId perdido sin reenviar POST. Orden, conciliación, inventario y bandeja local del comercio verificados con transporte ficticio; demos normal y de recibo perdido aprobadas. Suite completa 256/256 y typecheck salida 0. No hubo nuevos cobros ni frontend. La prueba bancaria comercial sigue bloqueada por compatibilidad de cuenta y semántica de metadata.clabe; los diagnósticos QR/Push anteriores siguen siendo evidencia bancaria separada.

## Continuación autorizada a G5 — 2026-11-07

PEY-001 (cuenta del portal no consultable por API) y PEY-002 (metadata.clabe observada como origen frente a receptor documentado) se guardan en docs/pey-pendientes.md. No se reinterpretan los pagos confirmados ni se retiran controles de G4.

G5 implementado: extracción OpenAI con salida estructurada, grounding determinista, catálogo/ofertas/propuestas sin autoridad de pago, calendario local y aclaraciones, AgentRun/idempotencia y migración 007. 332 pruebas, typecheck y demo HTTP ficticia aprobados. Gramática inicial acotada: condiciones no soportadas requieren aclaración. Validación con modelo real pendiente de clave/modelo y prueba autorizada. AGENT_PROVIDER apagado por defecto, sin frontend/G6 ni nuevos cobros. Ver docs/g5-shopping-agent.md.

## G5: caso positivo real verificado — 2026-11-07

Tras corregir saldo y autorizar un nuevo intento, una llamada a gpt-5.4-mini produjo propuesta válida de catálogo demo: 2 kg café, máximo $1,000, oferta $850. Política/grounding y replay sin otra llamada verificados. Ninguna orden aprobada, consentimiento o pago; DB temporal. No habilita llamadas ilimitadas ni G6. PEY-001/002 siguen abiertos y la evaluación general del modelo sigue acotada a esta evidencia.

## G6 — Interfaz mínima verificada (2026-11-07)

Frontend local adaptable implementado y probado con perfil fixture/mock: pedido, propuesta revisable, aprobación, solicitud pendiente, confirmación del simulador, resultado, comercio/preparación y auditoría. Backend BFF mantiene credenciales fuera del navegador y bloquea perfiles reales/producción. 346 pruebas, typecheck y recorrido móvil/escritorio aprobados. No se enviaron llamadas OpenAI ni cobros reales en G6. PEY-001/002 persisten; G7 no iniciado. Entrada pnpm web:up, guía docs/g6-frontend.md.


## Revisión posterior a G6 — 2026-11-07

Roadmap sincronizado con evidencia de docs/progress.md. Mejoras sobre G6: liberación idempotente de reservas de propuestas sin aprobar, recuperación explícita de la operación de solicitud con la clave original, tolerancia a almacenamiento bloqueado y verificación estricta del perfil local. No habilita G7 ni pagos comerciales reales. Ver docs/revision-2026-11-07.md para alcance, pruebas y límites. Los checklists históricos y prompts de inicio no sustituyen el estado global actual.


## Cierre G7-D de demo — 2026-11-07

Autorizada revisión adicional y preparación para concurso de 3 minutos. Comparación de ofertas explicada con checks del core, escenario de concurso aislado, cookies separadas y ensayo automatizado de cuatro escenarios. Suite 363/363, typecheck y pruebas de navegador aprobados. G7-D solo para fixture/mock local; G7-R comercial real y producción pendientes. Ver docs/g7-demo-validation.md y docs/concurso-demo-3-minutos.md. Cero nuevas llamadas OpenAI/pey.
