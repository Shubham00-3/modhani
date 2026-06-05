-- Avoid product catalogue load timeouts caused by older overlapping product
-- RLS policies evaluating customer-price subqueries during staff/admin loads.

create or replace function public.modhanios_customer_can_view_product(p_product_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.client_product_prices cpp
    join public.customer_client_assignments cca
      on cca.client_id = cpp.client_id
    join public.customer_contacts cc
      on cc.user_id = cca.customer_user_id
    where cca.customer_user_id = auth.uid()
      and cc.status = 'active'
      and cpp.product_id = p_product_id
      and cpp.is_active
      and cpp.price > 0
  );
$$;

drop policy if exists "products_select_authenticated" on public.products;
drop policy if exists "products_all_authenticated" on public.products;
drop policy if exists "products_all_staff" on public.products;
drop policy if exists "products_select_staff_or_customer_all" on public.products;
drop policy if exists "products_select_staff_or_customer_catalogue" on public.products;

create policy "products_staff_all" on public.products
for all to authenticated
using (public.modhanios_customer_portal_is_staff())
with check (public.modhanios_customer_portal_is_staff());

create policy "products_select_staff_or_assigned_customer" on public.products
for select to authenticated
using (
  public.modhanios_customer_portal_is_staff()
  or public.modhanios_customer_can_view_product(id)
);

revoke all on function public.modhanios_customer_can_view_product(text) from public;
grant execute on function public.modhanios_customer_can_view_product(text) to authenticated;
