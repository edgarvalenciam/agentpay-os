# Fase 7 — End-to-end, verificación y pitch (Gate G7)

## Escenarios
- [x] Oferta de $850 válida → intención → orden → solicitud → pago simulado verificado → comercio notificado.
- [x] Oferta $1,200 bloqueada sin crear solicitud.
- [x] Duplicado HTTP / webhook no causa doble cobro ni doble transición.
- [x] Timeout proveedor genera estado incierto, sin retry ciego.
- [x] Webhook monto, merchant o API key inconsistentes → excepción.
- [x] Confirmación tardía tras reserva vencida → pago registrado + fulfillment exception.
- [ ] Pago REAL: solo si autorizado, demostrado por banco/pey y claramente distinguido del simulado.
- [x] Logs y UI no muestran API key, firma, teléfono completo, RFC ni CLABE.

## Demo de 3 minutos
1. Instrucción natural del comprador.
2. AgentPay bloquea oferta que incumple reglas.
3. Selección aprobada de $850.
4. Comprador confirma envío de solicitud CoDi.
5. Pago real autorizado **o simulación explícitamente marcada**.
6. Webhook conciliado, orden pagada y comercio recibe pedido.
7. Vista de auditoría muestra la secuencia completa.

## G7
- [x] Demo repetible sin editar BD a mano.
- [x] Scripts/README, tests y resultados documentados.
- [x] Se declara claramente qué partes son mocks y qué integraciones son reales.

## Estado verificado

G7-D local SIMULADO verificado: 363 pruebas, typecheck, cuatro escenarios HTTP reproducibles y recorrido Chrome móvil/escritorio. Guion de 3 minutos para producto/innovación/integración preparado. Pruebas reales anteriores fueron diagnósticas separadas; G7-R comercial sigue pendiente de PEY-001/002. No se realizaron nuevos cobros ni llamadas pagadas. Ver docs/g7-demo-validation.md y docs/concurso-demo-3-minutos.md.
