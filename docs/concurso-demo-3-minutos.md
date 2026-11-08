# AgentPay OS — Demo de 3 minutos

Objetivo: demostrar producto, innovación e integración con evidencia. Perfil de esta presentación: SIMULADO, interpretación local fixture, sin llamadas OpenAI/pey. Los diagnósticos reales previos son evidencia separada; no presentarlos como este checkout.

## Antes de subir

Abrir `pnpm web:contest` y visitar http://127.0.0.1:3003/. La demo del concurso usa una base ficticia propia por arranque; la habitual continúa en 3002. El comando reutiliza un servidor de concurso sano, conservando su sesión. Si ya hay una compra pagada en pantalla, pulsar Preparar otra compra. No borra pedidos ni repone stock. Hay cinco compras de 2 kg por sesión nueva; ensayar con `pnpm demo:contest` para no consumir inventario de la presentación.

Ensayo automático: `pnpm demo:contest` usa cuatro bases temporales nuevas, las elimina al terminar y deja un reporte sanitizado en work/contest-report.json. No requiere claves ni modifica las bases de las demos o del receptor pey.

Para abrir en Terminal con doble clic, usar el helper Abrir-Demo-Concurso.command de outputs. Tener a mano las capturas sanitizadas y el reporte como respaldo. No abrir capturas bancarias con saldos, CLABE, teléfono o claves ante el jurado.

## Guion y acciones

| Tiempo | Acción | Qué decir |
|---|---|---|
| 0:00–0:20 | Mostrar Comprar y distintivo SIMULADO | «AgentPay conecta una intención de compra con una orden verificable. El agente propone; las reglas controlan presupuesto, disponibilidad y entrega; la persona conserva la autorización.» |
| 0:20–0:50 | Escribir “Compra 2 kg de café por máximo $800 mañana”. Mostrar rechazo. Pulsar ejemplo de $1,000 y Buscar propuesta. | «Con $800, las ofertas se bloquean y no hay orden ni cobro. Al fijar $1,000, el sistema elige $850 y rechaza $1,200. Aquí vemos las reglas y $150 de margen de presupuesto: no es un descuento inventado.» |
| 0:50–1:20 | Mostrar Por qué esta propuesta. Marcar revisión y Aprobar pedido. | «La decisión se explica con resultados del motor, no con una justificación inventada por IA. La propuesta se reserva y la aprobación queda ligada a un snapshot. Cambiar precio, beneficiario o condiciones obliga a verificar otra vez.» |
| 1:20–1:55 | Dar consentimiento separado y Solicitar CoDi simulado. Mostrar pendiente, pasar a Simulador y confirmar. | «Aprobar la orden no equivale a pagar. En esta demo usamos interpretación local y confirmación simulada. En operación real, la persona autoriza en su banco; el envío de la solicitud nunca acredita PAID.» |
| 1:55–2:30 | Volver a Comprar, luego Comercio. Mostrar una notificación, Iniciar preparación y Ver registro. | «La confirmación se concilia en el servidor. Solo entonces se consume inventario y se avisa al comercio. Repetir una respuesta o webhook no duplica esos efectos. El comercio prepara con evidencia, no con una captura del comprador.» |
| 2:30–3:00 | Cerrar con auditoría visible | «Implementamos adaptadores para OpenAI y pey. Ya verificamos un caso real con OpenAI y pagos diagnósticos QR y Push de un centavo; fueron pruebas separadas. La integración comercial real conserva dos pendientes con pey. Nuestra innovación es unir intención, políticas, consentimiento y conciliación en un flujo que puede explicarse y probarse.» |

## Respuestas breves al jurado

**¿Qué aporta frente a un chatbot con un link?** Una frontera de autoridad: el modelo no aprueba ni cobra. La propuesta pasa por políticas deterministas; el consentimiento vincula condiciones; pago, inventario y notificación se concilian con evidencia y sin duplicar efectos.

**¿Está funcionando con pey?** Adaptador y Standard Webhooks implementados y probados con fixtures. Los diagnósticos bancarios QR/Push anteriores sí se pagaron y verificaron. El E2E comercial real espera aclarar cómo consultar la cuenta del portal y qué campo acredita al receptor; no se ocultaron esos controles.

**¿La IA está en vivo aquí?** Esta presentación usa un intérprete local para ser repetible y no gastar llamadas. El adaptador OpenAI tiene salida estructurada y se probó además un caso positivo real. Eso no equivale a comprensión libre de todos los pedidos.

**¿Qué pasa si se cae la conexión o llega tarde?** Un envío incierto no se reenvía a ciegas. La consulta y el replay conservan la operación. El dinero tardío se registra; sin reserva válida, se marca una excepción de cumplimiento y no se prepara automáticamente.

**¿Ya es producción?** No. Demo local de un proceso, identidad de roles de prueba, catálogo acotado y sin entrega física. Los siguientes pasos son resolver evidencia del receptor con pey, ampliar evaluación del modelo y desarrollar identidad/operación de producción.

## Plan B

Si falla la pantalla, mostrar las capturas del ensayo y el reporte de cuatro escenarios, aclarando que son evidencia de una ejecución previa. Si falla internet, la demo fixture/mock funciona sin proveedores externos. No recrear un cobro real ni mostrar un mock como pago bancario para salvar la presentación.
