# Revisión independiente de pey — 2026-11-07

Responsable: Codex. Solo lecturas de documentación pública. Ninguna llamada al dominio financiero `api.pey.mx`, ningún uso de credenciales ni registro de cuenta.

## Cobertura

Se revisó la especificación OpenAPI completa (API 2026-10-20), con 11 operaciones, sus requests, respuestas exitosas, errores y paginación. Además, documentación de los cuatro eventos, seguridad, configuración, tipos, tutoriales y changelog. Se usó el sitemap público para comprobar cobertura de documentación sustantiva; no se trataron páginas de categorías, etiquetas ni marca como capacidades API.

Los TXT complementarios coinciden con sus cinco documentos equivalentes del ZIP (comparación de texto sin espacios exteriores). El ZIP es la base importada; no contiene implementación previa. El plan v1.2 se conserva con correcciones y avances verificables.

## Hechos y correcciones

1. `GET /payment-link/{id}` agrega `partial` a los estados del link; webhook solo enumera pending/processing/paid. No se documenta en el webhook el mismo conjunto que en GET: conservar diferencia y consultar al proveedor antes de diseñar manejo operativo de parcialidades.
2. El recurso completo de transacción utiliza `id`; las entradas resumidas en links y webhooks usan `transactionId`.
3. Los pares enviados como metadata del recurso aparecen en `metadata.externalMetadata` de transacciones; los valores regresan como strings. El GET del link conserva un mapa `metadata` directo.
4. La referencia de cuenta vigente y OpenAPI usan PENDING/PROCESSING/ACTIVE/ERROR en mayúsculas. Solo ACTIVE dispara el webhook.
5. Update de link solo modifica amount mientras pending y documenta redondeo half-up a dos decimales. AgentPay conserva centavos exactos y exige nuevo consentimiento si cambia contenido comercial.
6. `amountBreakdown` puede omitir componentes cero en transacciones de link; applicationFee puede ser null en el objeto resumido. Mantener bruto, base y neto separados.
7. Consultas por cuenta/QR protegen pertenencia a API key. Un 404 no demuestra rechazo del pagador.

## Supuestos y decisiones de AgentPay

El proveedor no documenta idempotencia del POST, reembolsos, payouts, escrow, splits ni débito CoDi sin autorización. Tampoco queda demostrada autorización contractual para operar cuentas de terceros. No se concluye que no existan fuera de la referencia pública.

Exactitud en centavos, reserva por orden, consentimiento ligado al snapshot, no reenviar tras timeout y bloqueo de métodos no implementados son decisiones de AgentPay; no capacidades garantizadas por pey. Los campos opcionales y respuestas sin required exhaustivo requieren validación conservadora en el futuro adaptador.

## Fuentes consultadas

- [OpenAPI oficial](https://docs.pey.mx/openapi.json)
- [docs/api/codi-api/](https://docs.pey.mx/docs/api/codi-api/)
- [docs/api/create-payment-link/](https://docs.pey.mx/docs/api/create-payment-link/)
- [docs/api/create-push-notification/](https://docs.pey.mx/docs/api/create-push-notification/)
- [docs/api/create-qr/](https://docs.pey.mx/docs/api/create-qr/)
- [docs/api/get-api-key-transactions/](https://docs.pey.mx/docs/api/get-api-key-transactions/)
- [docs/api/get-bank-account-transactions/](https://docs.pey.mx/docs/api/get-bank-account-transactions/)
- [docs/api/get-bank-account/](https://docs.pey.mx/docs/api/get-bank-account/)
- [docs/api/get-co-di-qr-transactions/](https://docs.pey.mx/docs/api/get-co-di-qr-transactions/)
- [docs/api/get-payment-link/](https://docs.pey.mx/docs/api/get-payment-link/)
- [docs/api/get-transaction/](https://docs.pey.mx/docs/api/get-transaction/)
- [docs/api/register-bank-account/](https://docs.pey.mx/docs/api/register-bank-account/)
- [docs/api/update-payment-link/](https://docs.pey.mx/docs/api/update-payment-link/)
- [docs/tutorials/getting-started/create-an-api-key/](https://docs.pey.mx/docs/tutorials/getting-started/create-an-api-key/)
- [docs/tutorials/getting-started/set-up-webhooks/](https://docs.pey.mx/docs/tutorials/getting-started/set-up-webhooks/)
- [docs/types/bank-account/](https://docs.pey.mx/docs/types/bank-account/)
- [docs/webhooks/bank-account/updated/](https://docs.pey.mx/docs/webhooks/bank-account/updated/)
- [docs/webhooks/codi/pn/](https://docs.pey.mx/docs/webhooks/codi/pn/)
- [docs/webhooks/codi/qr/](https://docs.pey.mx/docs/webhooks/codi/qr/)
- [docs/webhooks/introduction/](https://docs.pey.mx/docs/webhooks/introduction/)
- [docs/webhooks/payment-link/status-update/](https://docs.pey.mx/docs/webhooks/payment-link/status-update/)
- [docs/changelog/bank-accounts](https://docs.pey.mx/docs/changelog/bank-accounts)
- [docs/changelog/introduction](https://docs.pey.mx/docs/changelog/introduction)
- [docs/tutorials/use-cases/display-codi-qr](https://docs.pey.mx/docs/tutorials/use-cases/display-codi-qr)
- [docs/types/amount-breakdown](https://docs.pey.mx/docs/types/amount-breakdown)
- [docs/types/metadata-response](https://docs.pey.mx/docs/types/metadata-response)
- [docs/types/transaction-object](https://docs.pey.mx/docs/types/transaction-object)

SHA-256 del OpenAPI consultado: `497f48eb8047d88b1c8672fcb252eb8c7eee46546acaeb01440cfac8cd37335a`.
