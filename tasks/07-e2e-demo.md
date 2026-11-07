# Fase 7 — End-to-end, verificación y pitch (Gate G7)

## Escenarios
- [ ] Oferta de $850 válida → intención → orden → solicitud → pago simulado verificado → comercio notificado.
- [ ] Oferta $1,200 bloqueada sin crear solicitud.
- [ ] Duplicado HTTP / webhook no causa doble cobro ni doble transición.
- [ ] Timeout proveedor genera estado incierto, sin retry ciego.
- [ ] Webhook monto, merchant o API key inconsistentes → excepción.
- [ ] Confirmación tardía tras reserva vencida → pago registrado + fulfillment exception.
- [ ] Pago REAL: solo si autorizado, demostrado por banco/pey y claramente distinguido del simulado.
- [ ] Logs y UI no muestran API key, firma, teléfono completo, RFC ni CLABE.

## Demo de 3 minutos
1. Instrucción natural del comprador.
2. AgentPay bloquea oferta que incumple reglas.
3. Selección aprobada de $850.
4. Comprador confirma envío de solicitud CoDi.
5. Pago real autorizado **o simulación explícitamente marcada**.
6. Webhook conciliado, orden pagada y comercio recibe pedido.
7. Vista de auditoría muestra la secuencia completa.

## G7
- [ ] Demo repetible sin editar BD a mano.
- [ ] Scripts/README, tests y resultados documentados.
- [ ] Se declara claramente qué partes son mocks y qué integraciones son reales.
