-- =====================================================================
-- 0004 · Quitar los lotes de ejemplo (La Cañada, El Guamo, El Mirador)
-- Los lotes que no tienen producción se borran.
-- Los que ya tienen producción registrada se ocultan (no se pueden borrar
-- sin borrar esa producción), así el historial no se pierde.
-- Resultado esperado: "Success. No rows returned".
-- =====================================================================

delete from public.lotes l
where l.nombre in ('La Cañada', 'El Guamo', 'El Mirador')
  and not exists (select 1 from public.produccion p where p.lote_id = l.id);

update public.lotes
set activo = false
where nombre in ('La Cañada', 'El Guamo', 'El Mirador');
