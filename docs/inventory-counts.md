# Conteos físicos de inventario

El documento se maneja con los estados `draft`, `applied` y `cancelled`. Pertenece a una ubicación fija y solo `owner` y `admin` pueden usarlo, con `inventory.read` para consultar e `inventory.adjust` para modificar o aplicar. Se conservan las restricciones de acceso de inventario por ubicación.

## Captura y aplicación

- Las cantidades se capturan en la unidad base. `null` significa sin contar; `0` es un conteo confirmado sin existencias.
- Los artículos sin lotes ni caducidad se cuentan en conjunto. Los perecederos sin código de lote se agrupan por caducidad y código opcional. Los lotes controlados se cuentan individualmente.
- Un lote encontrado permanece dentro del borrador hasta aplicar. La caducidad es obligatoria cuando el artículo es perecedero, y puede estar vencida: registrar una existencia física caducada no la habilita para venta.
- Observaciones opcionales. El motivo está implícito en el movimiento `physical_count`; no se exige otra referencia.
- Aplicar conserva las reservas, registra diferencias en `inventory_movement_line` y relaciona el movimiento mediante `inventory_count.movement_id`. Las líneas sin diferencia no generan movimientos vacíos.
- Un déficit de cualquier lote bloquea nuevas reservas del artículo, aun si otros lotes tienen stock. Las asignaciones existentes se conservan.
- Los documentos aplicados no se editan, cancelan ni eliminan. Una corrección requiere otro conteo. No hay efectos retroactivos.

## Referencias, concurrencia y reintentos

`inventory_stock_revision` conserva una revisión por ubicación y artículo. Un trigger sobre `inventory_balance` avanza esa revisión en cada cambio físico, incluso en movimientos que se compensen entre sí. Los cambios únicamente de reservas no la avanzan. Los datos existentes comienzan implícitamente en revisión cero; no se recalculan sus cantidades al migrar.

Crear, actualizar una referencia y aplicar usan una barrera transaccional breve de PostgreSQL (`EXCLUSIVE NOWAIT` sobre `inventory_balance`). Esta barrera es global a la tabla mientras dura la operación, permite consultas ordinarias y protege también a los escritores existentes de ventas y compras. Nunca se mantiene durante la captura humana. Si hay un escritor o un `SELECT FOR UPDATE` en curso, el conteo responde `inventoryCount.busy` y puede reintentarse. La creación usa inserciones por lotes; se admiten hasta 5,000 artículos y 10,000 líneas por documento.

Si hubo movimientos en un artículo contado o cambió su configuración, aplicar devuelve `inventoryCount.stockChanged` con sus identificadores y no cambia ninguna existencia. Actualizar la referencia conserva la captura anterior, vacía las cantidades de los artículos indicados y exige un reconteo. Un cambio incompatible de unidad o configuración requiere un documento nuevo para ese artículo; puede dejarse sin contar en el documento anterior.

Las escrituras del borrador requieren `version` para evitar sobreescrituras concurrentes. Aplicar bloquea la cabecera y es idempotente: un reintento de un documento ya aplicado devuelve su resultado sin duplicar ajustes. Toda validación y escritura de la aplicación ocurre en la misma transacción.

## Rutas

Base: `/api/admin/inventory/locations/:locationId/counts`.

| Método | Ruta relativa       | Uso                                                   |
| ------ | ------------------- | ----------------------------------------------------- |
| GET    | `/`                 | Listar con `page`, `pageSize` y `status` opcional.    |
| POST   | `/`                 | Crear; `inventoryItemIds` opcional limita el alcance. |
| GET    | `/:countId`         | Consultar documento y conflictos.                     |
| PUT    | `/:countId`         | Guardar cantidades y observaciones del borrador.      |
| POST   | `/:countId/lines`   | Agregar un lote encontrado al borrador.               |
| POST   | `/:countId/refresh` | Renovar referencias de artículos y exigir reconteo.   |
| POST   | `/:countId/apply`   | Aplicar atómicamente.                                 |
| POST   | `/:countId/cancel`  | Cancelar borrador.                                    |

## Verificación y despliegue

La migración es `drizzle/0035_inventory_counts.sql`. Desplegar migración antes de la API nueva y luego Admin. Migrar no modifica existencias, reservas ni la activación de inventario de las sucursales.

Las pruebas unitarias/HTTP corren con `yarn test --run`. Las pruebas de PostgreSQL son optativas y crean/eliminan únicamente un esquema aleatorio `inventory_count_test_*` dentro de la base de pruebas indicada:

```sh
INVENTORY_COUNTS_TEST_DATABASE_URL=postgres://usuario:clave@127.0.0.1:5432/base_de_pruebas yarn test --run src/features/admin/inventory/counts --maxWorkers=1
```

Por defecto usan un esquema mínimo anterior a conteos. Para verificar contra el esquema completo puede establecerse `INVENTORY_COUNTS_TEST_BOOTSTRAP_SQL` con una migración inicial generada desde el esquema anterior, sin la funcionalidad de conteos. La suite aplica la migración nueva sobre esa base.
