-- Hassan Finance: run this once in Supabase → SQL Editor → New query → Run.

-- 1) Your data: one row per item, readable only by your own login.
create table if not exists public.docs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  col text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, col, id)
);
alter table public.docs enable row level security;
drop policy if exists "own docs" on public.docs;
create policy "own docs" on public.docs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) SMS inbox: the iPhone Shortcut drops bank SMS here; the app picks them up.
create table if not exists public.sms_inbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  body text not null,
  received_at timestamptz not null default now()
);
alter table public.sms_inbox enable row level security;
drop policy if exists "own inbox" on public.sms_inbox;
create policy "own inbox" on public.sms_inbox for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3) Secret key the Shortcut uses (generated in the app: Settings → iPhone SMS automation).
create table if not exists public.sms_keys (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  key text not null unique
);
alter table public.sms_keys enable row level security;
drop policy if exists "own key" on public.sms_keys;
create policy "own key" on public.sms_keys for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4) The only thing the Shortcut can call: add one SMS for the owner of the key.
--    One-time codes (OTP) are rejected and never stored.
create or replace function public.ingest_sms(k text, body text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if k is null or length(k) < 32 or body is null or length(body) = 0 or length(body) > 2000 then
    return 'rejected';
  end if;
  if body ~* '(OTP|one[- ]?time|رمز|كلمة المرور|verification|التحقق)' then
    return 'ignored (one-time code)';
  end if;
  select s.user_id into uid from public.sms_keys s where s.key = k;
  if uid is null then return 'unknown key'; end if;
  if (select count(*) from public.sms_inbox i where i.user_id = uid) > 500 then return 'inbox full'; end if;
  insert into public.sms_inbox (user_id, body) values (uid, body);
  return 'ok';
end $$;
revoke all on function public.ingest_sms(text, text) from public;
grant execute on function public.ingest_sms(text, text) to anon, authenticated;
