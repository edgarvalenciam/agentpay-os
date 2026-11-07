# Arquitectura del adaptador pey — contratos para Codex

**Estado:** diseño de AgentPay, no contrato oficial del proveedor. El archivo `docs/pey-capabilities.md` distingue qué campos son reales.

## Regla de separación

```text
Comprador/OpenAI → Intent → Policy → Order (snapshot+consentimiento)
  → PaymentAttempt (persistido) → PaymentOrchestrator → Adaptor pey
  → raw webhook/consulta → verificar autenticidad y coincidencias
  → Transaction + ReconciliationDecision → Order PAID/EXCEPTION
  → outbox → notificación al comercio
```

`packages/core` define tipos y políticas, sin dependencias HTTP o SDK. Los adaptadores por método implementan capacidades concretas: `PeyCodiPushGateway`, `PeyCodiQrGateway`, `PeyPaymentLinkGateway`, `PeyBankAccountGateway` y `PeyTransactionGateway`. No usar la misma suposición de cardinalidad/identificadores para los tres medios.

## Tipos **propios** propuestos

```ts
type PaymentMethod = 'CODI_PUSH' | 'CODI_QR' | 'PAYMENT_LINK';
type PaymentProviderId = 'mock' | 'pey';
type ProviderResourceType = 'PUSH_TRANSACTION' | 'CODI_QR' | 'PAYMENT_LINK';

type PaymentAttemptStatus =
  | 'CREATED'
  | 'SUBMISSION_PENDING'
  | 'SUBMISSION_UNKNOWN'
  | 'SUBMITTED'
  | 'PAYMENT_PENDING'
  | 'CONFIRMED'
  | 'RECONCILIATION_EXCEPTION'
  | 'CANCELLED_LOCALLY';

interface MerchantPaymentAccount {
  id: string;
  merchantId: string;
  provider: PaymentProviderId;
  providerBankAccountId: string | null;
  codiStatus: 'PENDING' | 'PROCESSING' | 'ACTIVE' | 'ERROR' | 'UNKNOWN';
  beneficiaryDisplayName: string;
  // CLABE/RFC cifrados o referenciados en vault; no en el audit log.
}

interface PaymentAttempt {
  id: string;
  orderId: string;
  method: PaymentMethod;
  provider: PaymentProviderId;
  providerResourceType: ProviderResourceType | null;
  providerResourceId: string | null;
  providerTransactionId: string | null;
  codiId: string | null;
  requestedAmountMinor: number;
  currency: 'MXN';
  status: PaymentAttemptStatus;
  idempotencyKey: string;
  createdAt: string;
}
```

El QR puede generar más de una transacción; link puede contener varias operaciones bajo `transactions[]`. Modelar **`ProviderTransaction` 1:N `ProviderResource`** cuando corresponda. Para CoDi Push, `transactionId` existe desde la creación.

## Interfaz de puertos (pseudocódigo de dominio; no SDK pey)

```ts
interface PaymentGateway {
  readonly method: PaymentMethod;
  submit(input: CreateRequest): Promise<SubmitResult>;
  // La capacidad de consultar depende del método; evitar asumir un único identificador.
  reconcile(input: ReconciliationQuery): Promise<ReconciliationResult>;
}

interface BankAccountGateway {
  register(input: RegisterAccount): Promise<RegistrationResult>;
  getStatus(providerBankAccountId: string): Promise<BankAccountStatus>;
}

interface WebhookVerifier {
  verify(rawBody: Uint8Array, headers: Record<string, string>): VerifiedProviderEvent;
}
```

## Invariantes de negocio

1. `amountMinor` siempre entero. Conversión a pesos decimales con aritmética exacta en el adaptador; lectura de números del proveedor normalizada a centavos **sin tolerancia silenciosa**.
2. El modelo OpenAI nunca recibe `PEY_API_KEY` ni puede invocar `PaymentGateway` directamente.
3. Una orden solo es cobrable tras oferta elegible, reserva válida, snapshot fijo y consentimiento explícito del comprador.
4. Un intento de pago debe persistirse con clave de idempotencia única **antes** del POST externo. Bloqueo transaccional por orden para impedir concurrencia de solicitudes.
5. Timeout, error de conexión tras envío o respuesta perdida → `SUBMISSION_UNKNOWN`: **no reintentar POST automático** si el proveedor no documenta idempotencia nativa; resolver por eventos, soporte, búsqueda disponible, o revisión manual. Listados de transacciones pueden ayudar a conciliar pagos, pero no prueban si una solicitud sin pago fue enviada.
6. Webhooks: firma Standard Webhooks verificada sobre cuerpo crudo, secreto por API key, timestamp sujeto a validación del SDK, `webhook-id` único por entrega. Responder éxito solamente después de persistir evento o registrarlo duraderamente.
7. Correlación fuerte: `providerTransactionId`/`providerResourceId`, API key, importe, moneda, método, comerciante/beneficiario, orden y referencia/metadata. En eventos de CoDi Push, `bankAccountId` es **condicional**; en su ausencia usar la configuración de la API key como dato esperado, más consulta de transacción cuando sea necesario.
8. Eventos repetidos o en distinto orden no producen doble orden/comisión. Prever cambios posteriores a expiración: un `PAID` real no se descarta por vencimiento comercial, pasa a excepción operativa si inventario no está disponible.
9. Datos personales y banco: no persistir CLABE/RFC crudos en registros de auditoría; permisos por comerciante/tenant en V1.
10. `PAYMENT_PROVIDER=mock` y `ALLOW_REAL_PAYMENTS=false` por defecto; no inferir consentimiento para transacciones financieras de una solicitud de coding.

## Diferencias por medio

| Propiedad | CoDi Push | CoDi QR | Payment Link |
|---|---|---|---|
| Inicio pey | `POST /codi/pn` | `POST /codi/qr` | `POST /payment-link/create` |
| Recurso de creación | `transactionId` + `codiId` | `id` QR + `qrString` | `id` link + `url` |
| Experiencia | Cobro al teléfono, banco autoriza | Usuario escanea en banco | Checkout redirigido (CoDi/tarjeta/wallet según habilitación) |
| Consulta | `GET /transaction/:id` | `GET /transaction/codi/qr/:id` | `GET /payment-link/:id`, transacciones asociadas |
| Evento | `codi.pn.payment_received` | `codi.qr.payment_received` | `payment_link.status_updated` |
| Riesgo específico | Delivery desconocido, no reintentar | QR abierto/múltiples pagos | Tips/fees, redirect ≠ pago, monto mutable mientras pending |
| Prioridad | P0 | P1 | P1 |

## Estrategia de confirmación

- **CoDi Push**: `200` al POST → pago pendiente. `codi.pn.payment_received` firmado y conciliado o `GET /transaction/:id` con `PAID` contrastado con datos esperados → confirmar una vez. El webhook es notificación, la consulta ofrece recuperación. No hay endpoint documentado para conocer si el celular mostró la notificación.
- **CoDi QR**: `201` solo crea QR. Para pago recibido exigir `transactionId` individual, importe exacto del pedido y correlación; cuidado con pagos múltiples asociados al mismo QR. Evitar `amount: 0` para órdenes.
- **Payment Link**: `paid` en webhook o estado consultado se evalúa con `transactions[]`, `base/tip/fee` y referencia. Redirección `successUrl` no autoriza marcar pagada una orden. Si hay reintentos/múltiples operaciones, auditar cada una.
- **Cuenta bancaria**: `bank.account.updated` solo da `ACTIVE`; otros estados se obtienen por `GET /bank-account/:id`.

## Tests de diseño contractuales

- Misma `Idempotency-Key` y mismo request → único intento; misma clave con contenido distinto → conflicto.
- Timeout externo antes de recibir respuesta → `SUBMISSION_UNKNOWN`; POST no se reenvía.
- Múltiples webhooks del mismo `webhook-id` → un solo evento persistido.
- `transactionId` repetido con distinto `webhook-id` → una sola transición a PAID.
- Webhook de otro `apiKeyId` o destinatario esperado → excepción y orden no PAID.
- Evento `amount=850` frente a orden por 85000 centavos → PAID; `849.99` → excepción.
- Link con `hasTip=true` o cargos no contemplados en orden de precio fijo → bloquear o reconciliar con política explícita, nunca asumir pago exacto.
- QR abierto (`amount=0`) no elegible para checkout de importe cerrado.
- Reserva expirada después de pago confirmado → dinero real registrado y excepción de fulfillment, no autodevolución.
