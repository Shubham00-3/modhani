-- Editable staff profile fields (phone, joined date) with admin-guarded RPC.
--
-- Adds two display/profile columns to public.profiles and an admin-only RPC to
-- update a target user's full name, phone, and joined date. The RPC mirrors the
-- security model of modhanios_update_staff_permissions (asserts the caller can
-- manage settings) and writes an audit event so every edit shows in the trail.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists joined_at date;

create or replace function public.modhanios_update_staff_profile(
  p_user_id uuid,
  p_target_user_id uuid,
  p_full_name text,
  p_phone text,
  p_joined_at date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_new_name text;
  v_new_phone text;
begin
  -- Caller must be an enabled settings admin.
  select * into v_profile from public.modhanios_assert_manage_settings(p_user_id);

  select * into v_target
  from public.profiles
  where user_id = p_target_user_id
  for update;

  if not found then
    raise exception 'Target user not found.';
  end if;

  v_new_name := nullif(btrim(coalesce(p_full_name, '')), '');
  if v_new_name is null then
    raise exception 'Full name is required.';
  end if;

  v_new_phone := nullif(btrim(coalesce(p_phone, '')), '');

  update public.profiles
  set
    full_name = v_new_name,
    phone = v_new_phone,
    joined_at = p_joined_at
  where user_id = p_target_user_id;

  perform public.modhanios_insert_audit(
    'user_profile_updated',
    null,
    null,
    p_user_id,
    v_profile.full_name,
    format('Updated profile for %s', v_target.full_name),
    format(
      'Name:%s Phone:%s Joined:%s',
      v_target.full_name,
      coalesce(v_target.phone, '-'),
      coalesce(v_target.joined_at::text, '-')
    ),
    format(
      'Name:%s Phone:%s Joined:%s',
      v_new_name,
      coalesce(v_new_phone, '-'),
      coalesce(p_joined_at::text, '-')
    )
  );
end;
$$;

revoke all on function public.modhanios_update_staff_profile(uuid, uuid, text, text, date) from public;
grant execute on function public.modhanios_update_staff_profile(uuid, uuid, text, text, date) to authenticated;
