# G7 — Validación y entrega de demo local (2026-11-07)

Estado: G7-D verificado para demo SIMULADO. G7-R comercial real pendiente de PEY-001/002. No acredita producción, comprensión libre de lenguaje o integración comercial bancaria completa.

## Mejoras de producto

- Decisión explicada con todos los candidatos comparables consultados (máximo 100): precio, checks y razones reales del core. Menor precio elegible seleccionado; una oferta de $1,200 aparece bloqueada ante límite $1,000. Margen de presupuesto $150, no promesa de ahorro/descuento.
- Rechazo por presupuesto muestra razones sin aprobar ni cobrar. La decisión se guarda en AgentRun para replay sin otra invocación del intérprete. Revalidación al reservar, aprobar y pedir pago conserva autoridad del core; concurrencia por último stock no deja candidato falsamente seleccionado.
- Perfil de concurso aislado en 127.0.0.1:3003, con DB nueva por arranque en work/contest-runtime/sessions/<id>. Datos anteriores preservados, sin reset/limpieza de evidencia bancaria. El launcher reutiliza el proceso sano: no renueva stock por volver a ejecutarlo. La demo habitual 3002 y la de concurso tienen cookies distintas; no se invalidan entre sí.
- Si cambia el ID de sesión de concurso, el navegador descarta su compra anterior antes de consultar la nueva DB; no restaura un pago ajeno al ensayo. sessionStorage no es autoridad financiera.
- `pnpm demo:contest` ejecuta cuatro escenarios en DBs temporales propias con HTTP loopback, intérprete fixture y gateway mock. Sin nuevas dependencias o migraciones.

## Pruebas observadas

Suite final **363/363 en 17 archivos (28.12 s)**, seis regresiones adicionales respecto de 357: comparación explicada, último stock concurrente, cambio de precio tras propuesta, cookies entre puertos, explicación en cliente y cambio de sesión de concurso. Typecheck y node --check aprobados.

`pnpm demo:contest` aprobado dos veces: cuatro escenarios y diez comprobaciones. Happy path, timeout después de aceptación, importe erróneo y pago tardío; rechazo de presupuesto/firma, solicitud doble, outbox, preparación, duplicados de entrega/transacción y reinicio de API. No se afirma reinicio de proceso completo en este script: persistencia al cerrar/reabrir DB también está cubierta por otras pruebas de integración. `pnpm demo:agent` y `pnpm demo:pey:recovery` aprobadas tras cambios; todas usan transporte ficticio para proveedores.

Navegador Chrome: presupuesto $800 rechazado; con $1,000 se muestran $850 elegido, $1,200 rechazado, margen $150 y 14 checks; aprobación separada, solicitud pendiente, recarga conservada, simulador explícito, PAID del backend, una notificación, preparación y registro. Móvil 390×844 sin desbordamiento (contentWidth=clientWidth=390). Se restauró tamaño habitual, se guardaron capturas sanitizadas y se dejó nueva compra disponible conservando el historial del ensayo.

Operación: al reiniciar inmediatamente los servidores, la demo habitual intentó abrir su lock antes de finalizar el cierre previo. Falló sin borrar locks ni datos; se reabrió correctamente al terminar el cierre. No se tocó receptor/túnel pey. Un lock residual exige revisar el proceso, nunca eliminarlo a ciegas.

## Matriz de evidencia

| Requisito | Evidencia ejecutable |
|---|---|
| $850 elegible y $1,200 rechazado | core.test, integration.test, shopping-agent.test y demo:contest; visible en navegador |
| Entrega tardía / precio cambia / cuenta no habilitada | core.test, integration.test, pey-payments.test y web-app.test |
| Doble solicitud / replay | payments.test, pey-payments.test, web-client.test, web-app.test y demo:contest |
| Timeout / UNKNOWN sin reenvío | payments.test, pey-payments.test y demo:contest |
| Firma incorrecta / monto/API key/metadata ajenos | pey-webhook.test, pey-payments.test, payments.test y demo:contest |
| Misma entrega o misma transacción en IDs distintos | payments.test, pey-payments.test y demo:contest |
| Dinero tardío sin stock/reserva válida | payments.test, pey-payments.test, web-app.test y demo:contest |
| Preparar antes de pago bloqueado | web-app.test y demo:contest |
| Reinicio / outbox tras fallo | integration.test, payments.test, shopping-agent.test y demos de recuperación |
| Recarga / caché manipulada / pérdida de red | web-client.test, web-app.test y recorrido Chrome |
| Prompt injection sin autoridad financiera | shopping-intent.test, openai-intent.test y shopping-agent.test |
| Privacidad | Respuestas/sesiones sin tokens, Host/Origin/CSRF, CSP, fixtures, chequeo de valores privados antes del commit y ZIP de archivos versionados |
| Reset de demo sin borrar evidencia | Sesiones nuevas con directorios distintos observadas; DBs de ensayo automático temporales y propias |
| Evidencia real | Histórica, diagnósticos QR/Push y un caso OpenAI: docs/pey-validation.md; no repetida en G7 |

## Entrega y límites

Guion de 3 minutos, relato de producto/innovación/integración, preguntas y plan B: docs/concurso-demo-3-minutos.md. Reporte sanitizado del ensayo: work/contest-report.json y copia en outputs. Capturas: AgentPay-Concurso-Movil.png y AgentPay-Concurso-Comercio.png. Helper Abrir-Demo-Concurso.command preparado en outputs. ZIP de fuentes versionadas sin secretos, DBs o work. Sin push remoto ni publicación.

Nuevas llamadas OpenAI: 0. Nuevos cobros/consultas pey: 0. Las autorizaciones anteriores no se ampliaron. Los dos pendientes bancarios, evaluación real amplia del modelo, metadatos explícitos de versión de prompt/modelo y trabajo de producción siguen abiertos. No se ofrece QR/links comerciales, reembolso ni autorización bancaria automática.
