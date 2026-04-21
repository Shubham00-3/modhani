create table if not exists public.notification_dismissals (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  notification_key text not null,
  dismissed_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, notification_key)
);

create index if not exists idx_notification_dismissals_user_id
  on public.notification_dismissals (user_id, dismissed_at desc);

alter table public.notification_dismissals enable row level security;

drop policy if exists "notification_dismissals_select_own" on public.notification_dismissals;
create policy "notification_dismissals_select_own" on public.notification_dismissals
for select to authenticated using (auth.uid() = user_id);

drop policy if exists "notification_dismissals_insert_own" on public.notification_dismissals;
create policy "notification_dismissals_insert_own" on public.notification_dismissals
for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "notification_dismissals_delete_own" on public.notification_dismissals;
create policy "notification_dismissals_delete_own" on public.notification_dismissals
for delete to authenticated using (auth.uid() = user_id);
