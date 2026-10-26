# Disponibilidad de categorías por sucursal

Todas las categorías están activas por defecto, incluso en sucursales o categorías nuevas.
`organization_product_category` almacena únicamente configuraciones por sucursal. Una
configuración inactiva bloquea también a todos sus descendientes sin modificar sus valores
individuales; al reactivar al padre se conservan los estados previos.

Un producto activo puede venderse si no tiene categorías o si al menos una de sus categorías
está efectivamente activa. Se contemplan tanto `product_category_link` como `product.category_id`.
Un componente de un compuesto sigue esta misma regla; si una sección no tiene ninguna opción
disponible, el compuesto completo se oculta y no puede comprarse.

- `GET /api/admin/products/categories` incluye `organizationStatus` (propio, efectivo y heredado),
  siempre según la sucursal de la sesión. El listado administrativo no oculta categorías.
- `PATCH /api/admin/products/categories/:categoryId/organization-status` recibe `{ isActive }`.
  Exige rol owner/admin y permiso `productCategories:update`. No acepta una sucursal del cliente.
- Los listados Guest/Customer de categorías admiten `organizationId`. Sin ese parámetro mantienen
  temporalmente el contrato global anterior para no romper versiones instaladas.
- Con sucursal, catálogo, populares, recomendados, favoritos y configuración directa filtran
  disponibilidad. La validación final del pedido siempre aplica la regla, aun en clientes antiguos.

## Despliegue

1. Ejecutar `yarn db:migrate` en el entorno objetivo para aplicar `0034_organization_product_categories`.
   Es aditiva: no borra categorías, productos, relaciones ni pedidos. No necesita backfill.
2. Desplegar la API, después el Admin y finalmente las nuevas versiones de Mobile e In Place.
3. Las versiones nuevas envían sucursal en la consulta de categorías. El cambio se observa al
   recargar el catálogo; no hay actualización push de catálogos. Un carrito previo no evita el
   rechazo del pedido si su producto dejó de estar disponible.

Los cambios en nombre, jerarquía, imagen o eliminación de categorías siguen siendo globales.
Activar una categoría no activa por sí mismo sus productos ni los asigna a una sucursal.
